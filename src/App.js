import React, { useRef, useEffect, useState } from "react";
import io from "socket.io-client";

const socket = io(process.env.REACT_APP_SIGNALING_SERVER_URL);

const App = () => {
  const localVideoRef = useRef(null);
  const peerConnections = useRef({});
  const [isCallStarted, setIsCallStarted] = useState(false);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localVideoRef.current.srcObject = stream;

        socket.on("user-joined", (userId) => {
          const peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
          });

          stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

          peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
              socket.emit("ice-candidate", { to: userId, candidate: event.candidate });
            }
          };

          peerConnection.ontrack = (event) => {
            // Handle remote stream
          };

          peerConnections.current[userId] = peerConnection;
        });

        socket.on("offer", async ({ from, offer }) => {
          const peerConnection = peerConnections.current[from];
          await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          socket.emit("answer", { to: from, answer });
        });

        socket.on("answer", async ({ from, answer }) => {
          const peerConnection = peerConnections.current[from];
          await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        });

        socket.on("ice-candidate", async ({ from, candidate }) => {
          const peerConnection = peerConnections.current[from];
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        });

        socket.emit("join-call");
      });

    socket.on("all-users", (users) => {
      setUsers(users);
    });
  }, []);

  const startCall = async () => {
    users.forEach(async (userId) => {
      const peerConnection = peerConnections.current[userId];
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit("offer", { to: userId, offer });
    });
    setIsCallStarted(true);
  };

  return (
    <div>
      <h2>Real-Time Video Call</h2>
      <div>
        <video ref={localVideoRef} autoPlay playsInline muted />
        {/* Add video elements for remote streams */}
      </div>
      {!isCallStarted && <button onClick={startCall}>Start Call</button>}
    </div>
  );
};

export default App;
