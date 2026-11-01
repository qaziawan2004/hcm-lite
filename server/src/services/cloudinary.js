import { v2 as cloudinary } from 'cloudinary';

let uploadOverride;

export const cloudinaryConfigured = () => Boolean(
  uploadOverride || (process.env.CLOUDINARY_CLOUD_NAME
  && process.env.CLOUDINARY_API_KEY
  && process.env.CLOUDINARY_API_SECRET)
);

export function setCloudinaryUploaderForTests(uploader) {
  uploadOverride = uploader;
}

export async function uploadProfilePhoto(buffer, userId) {
  if (uploadOverride) return uploadOverride(buffer, userId);

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      folder: 'hcm-lite/profile-photos',
      public_id: String(userId),
      overwrite: true,
      resource_type: 'image',
      allowed_formats: ['jpg', 'png', 'webp'],
      transformation: [{ width: 512, height: 512, crop: 'fill', gravity: 'face', quality: 'auto', fetch_format: 'auto' }],
    }, (error, result) => {
      if (error) return reject(error);
      if (!result?.secure_url || !result.public_id) return reject(new Error('Cloudinary returned an incomplete upload result.'));
      resolve({ url: result.secure_url, publicId: result.public_id });
    });

    stream.end(buffer);
  });
}
