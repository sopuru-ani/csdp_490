import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
function Home() {
  const [connectedMsg, setConnectedMsg] = useState(false);
  const [disconnectedMsg, setDisconnectedMsg] = useState(false);
  useEffect(() => {
    console.log(navigator.getGamepads());
    window.addEventListener("gamepadconnected", (e) => {
      console.log("connected");
      setConnectedMsg(true);
      setTimeout(() => {
        setConnectedMsg(false);
      }, 4000);
    });
    window.addEventListener("gamepaddisconnected", (e) => {
      console.log("disconnected");
      setDisconnectedMsg(true);
      setTimeout(() => {
        setDisconnectedMsg(false);
      }, 4000);
    });
  }, []);
  return (
    <div className="p-3">
      <div
        className={`fixed left-1/2 -translate-x-1/2 p-3 text-sm bg-green-300 rounded-full shadow-lg transition-all duration-500 ease-in-out ${connectedMsg ? "top-3" : "-top-20"}`}
      >
        controller input detected
      </div>
      <div
        className={`fixed left-1/2 -translate-x-1/2 p-3 text-sm bg-red-300 rounded-full shadow-lg transition-all duration-500 ease-in-out ${disconnectedMsg ? "top-3" : "-top-20"}`}
      >
        controller disconnected
      </div>
      <nav>
        <Link to="/">Home</Link> | <Link to="/login">Login</Link> |{" "}
        <Link to="/signup">Signup</Link>
      </nav>
      This is our fully working and ready to ship AI lost and found tracker
    </div>
  );
}

export default Home;
