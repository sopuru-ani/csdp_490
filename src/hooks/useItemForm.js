import { useState } from "react";

const API_URL = "http://localhost:8000";

export function useItemForm(itemType) {
  const [itemName, setItemName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  function handleFileChange(e) {
    const selected = Array.from(e.target.files);
    setFiles(selected);
    setPreviews(selected.map((f) => URL.createObjectURL(f)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Step 1: upload images if any
      let imagePaths = [];
      if (files.length > 0) {
        const formData = new FormData();
        files.forEach((f) => formData.append("files", f));

        const uploadRes = await fetch(`${API_URL}/items/upload`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.json();
          throw new Error(err.detail || "Image upload failed");
        }

        const uploadData = await uploadRes.json();
        imagePaths = uploadData.paths;
      }

      // Step 2: submit the item with the returned paths
      const itemRes = await fetch(`${API_URL}/items/${itemType}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_name: itemName,
          description,
          location,
          image_paths: imagePaths,
        }),
      });

      if (!itemRes.ok) {
        const err = await itemRes.json();
        throw new Error(err.detail || "Failed to submit item");
      }

      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return {
    itemName,
    setItemName,
    description,
    setDescription,
    location,
    setLocation,
    previews,
    loading,
    error,
    success,
    handleFileChange,
    handleSubmit,
  };
}
