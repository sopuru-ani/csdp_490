import { Link } from "react-router-dom";
function Home() {
  return (
    <div>
      <nav>
        <Link to="/">Home</Link> | <Link to="/login">Login</Link> |{" "}
        <Link to="/signup">Signup</Link>
      </nav>
      This is our fully working and ready to ship AI lost and found tracker
    </div>
  );
}

export default Home;
