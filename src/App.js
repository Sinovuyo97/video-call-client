import React, { useRef, useEffect, useState } from "react";
import io from "socket.io-client";

const socket = io(process.env.REACT_APP_SIGNALING_SERVER_URL); // Connect to signaling server

const App = () => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnection = useRef(null);
  const [isCallStarted, setIsCallStarted] = useState(false);
  const iceCandidatesQueue = [];

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localVideoRef.current.srcObject = stream;
        peerConnection.current = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });

        stream.getTracks().forEach(track => peerConnection.current.addTrack(track, stream));

        peerConnection.current.onicecandidate = (event) => {
          if (event.candidate) {
            console.log("Sending ICE candidate:", event.candidate);
            socket.emit("ice-candidate", event.candidate);
          }
        };

        peerConnection.current.ontrack = (event) => {
          remoteVideoRef.current.srcObject = event.streams[0];
        };
      });

    socket.on("offer", async (offer) => {
      console.log("Received offer:", offer);
      if (peerConnection.current.signalingState === "stable" || peerConnection.current.signalingState === "have-local-offer") {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);
        socket.emit("answer", answer);

        // Process queued ICE candidates
        while (iceCandidatesQueue.length) {
          const candidate = iceCandidatesQueue.shift();
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } else {
        console.warn("Peer connection is not in a stable state to set remote offer.");
      }
    });

    socket.on("answer", async (answer) => {
      console.log("Received answer:", answer);
      if (peerConnection.current.signalingState === "have-local-offer") {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));

        // Process queued ICE candidates
        while (iceCandidatesQueue.length) {
          const candidate = iceCandidatesQueue.shift();
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } else {
        console.warn("Peer connection is not in a state to accept an answer.");
      }
    });

    socket.on("ice-candidate", async (candidate) => {
      if (candidate) {
        console.log("Received ICE candidate:", candidate);
        if (peerConnection.current.remoteDescription) {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          iceCandidatesQueue.push(candidate);
        }
      }
    });
  }, []);

  const startCall = async () => {
    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offer);
    socket.emit("offer", offer);
    setIsCallStarted(true);
  };

  return (
    <div>
      <h2>Real-Time Video Call</h2>
      <div>
        <video ref={localVideoRef} autoPlay playsInline muted />
        <video ref={remoteVideoRef} autoPlay playsInline />
      </div>
      {!isCallStarted && <button onClick={startCall}>Start Call</button>}
    </div>
  );
};

export default App;
