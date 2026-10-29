/**
 * Client-side photo compression before upload: max 1200 px, JPEG quality 0.7.
 *
 * DO NOT REWRITE. Copied from a system used in the field for months.
 *
 * - A 12 MP photo becomes ~150 KB: enough to read a label, and on a weak field
 *   network the difference between "uploads" and "times out".
 * - Re-encoding through a canvas DROPS ALL EXIF METADATA, including the GPS
 *   position many phones embed in photos. This is required: the product never
 *   records workers' location. Never upload the original file.
 * - Browsers apply the EXIF orientation when decoding the image, so the drawn
 *   canvas is already upright.
 */
export async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode_failed"));
      img.onload = () => {
        const max = 1200;
        let w = img.width;
        let h = img.height;
        if (w > max || h > max) {
          const r = Math.min(max / w, max / h);
          w = Math.round(w * r);
          h = Math.round(h * r);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("encode_failed"))),
          "image/jpeg",
          0.7,
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
