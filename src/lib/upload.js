import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { storage } from "./firebase";

const upload = async (file) => {
  const date = Date.now();

  console.log("📤 [upload.js] Starting file upload:", {
    name: file.name,
    type: file.type,
    size: file.size,
    sizeMB: (file.size / (1024 * 1024)).toFixed(2),
  });

  // Detect images vs other files
  // Handle files without MIME type (fallback to checking extension or defaulting to files)
  const isImage = file.type && file.type.startsWith("image/");

  const folder = isImage ? "images" : "files";
  const storagePath = `${folder}/${date}_${file.name}`;

  console.log("📁 [upload.js] File will be stored in:", storagePath);

  const storageRef = ref(storage, storagePath);

  const uploadTask = uploadBytesResumable(storageRef, file);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const progress =
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        console.log(`📊 [upload.js] Upload progress: ${progress.toFixed(1)}%`);
      },
      (error) => {
        console.error("❌ [upload.js] Upload error:", error);
        console.error("❌ [upload.js] Error code:", error.code);
        console.error("❌ [upload.js] Error message:", error.message);
        reject(new Error(`Upload failed: ${error.code} - ${error.message}`));
      },
      async () => {
        try {
          console.log("✅ [upload.js] Upload completed, getting download URL...");
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          
          const result = {
            url: downloadURL,
            name: file.name,
            type: file.type || "application/octet-stream",
            size: file.size,
            path: storagePath,
          };

          console.log("✅ [upload.js] File uploaded successfully:", result);
          resolve(result);
        } catch (urlError) {
          console.error("❌ [upload.js] Error getting download URL:", urlError);
          reject(new Error(`Failed to get download URL: ${urlError.message}`));
        }
      }
    );
  });
};

export default upload;
