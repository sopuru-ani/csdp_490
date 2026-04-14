import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const position = [38.8951, -77.0364]; // example coords

export default function MapView() {
  return (
    <div className="h-125 w-full">
      <MapContainer
        center={position}
        zoom={13}
        scrollWheelZoom={false}
        style={{ height: "500px", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>'
          url="https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png"
        />
        <Marker position={position}>
          <Popup>Your lost item was reported here!</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
