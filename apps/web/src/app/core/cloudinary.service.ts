import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

export interface CloudinaryUploadResult {
  publicId: string;
  url: string;
  thumbnailUrl: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
}

@Injectable({ providedIn: 'root' })
export class CloudinaryService {
  isConfigured(): boolean {
    return !!(environment.cloudinary.cloudName && environment.cloudinary.uploadPreset);
  }

  /**
   * Upload a file directly to Cloudinary using the unsigned preset.
   * Returns a promise with the upload metadata.
   * Supports onProgress callback (0-100).
   */
  upload(file: File, onProgress?: (pct: number) => void): Promise<CloudinaryUploadResult> {
    return new Promise((resolve, reject) => {
      if (!this.isConfigured()) {
        reject(new Error('Cloudinary is not configured. Add cloudName + uploadPreset to environment.ts'));
        return;
      }

      const { cloudName, uploadPreset } = environment.cloudinary;
      const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', uploadPreset);

      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
      }

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const res = JSON.parse(xhr.responseText);
          resolve({
            publicId: res.public_id,
            url: res.secure_url,
            thumbnailUrl: this.thumbnailUrl(res.public_id),
            format: res.format,
            width: res.width,
            height: res.height,
            bytes: res.bytes,
          });
        } else {
          let msg = 'Upload failed';
          try {
            msg = JSON.parse(xhr.responseText)?.error?.message || msg;
          } catch {
            // ignore
          }
          reject(new Error(msg));
        }
      });
      xhr.addEventListener('error', () => reject(new Error('Network error')));
      xhr.open('POST', url);
      xhr.send(formData);
    });
  }

  thumbnailUrl(publicId: string): string {
    const { cloudName } = environment.cloudinary;
    return `https://res.cloudinary.com/${cloudName}/image/upload/c_fill,w_240,h_180,q_auto,f_auto/${publicId}`;
  }

  fullUrl(publicId: string, width = 1600): string {
    const { cloudName } = environment.cloudinary;
    return `https://res.cloudinary.com/${cloudName}/image/upload/c_limit,w_${width},q_auto,f_auto/${publicId}`;
  }
}
