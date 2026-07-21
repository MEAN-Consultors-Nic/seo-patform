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
  resourceType: 'image' | 'raw' | 'video';
  originalFilename: string;
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
   *
   * Endpoint is chosen per file type instead of using /auto/upload:
   *   image/*  → /image/upload
   *   video/*  → /video/upload
   *   anything else (PDF, DOC, ZIP, TXT, …) → /raw/upload
   *
   * The /auto endpoint defaults PDFs to resource_type=image, and by
   * default Cloudinary blocks PDF/ZIP delivery from image resources
   * for security ("Restricted media types" is on for new accounts).
   * Routing docs through /raw/upload avoids the restriction and the
   * resulting `/raw/upload/...pdf` URL is publicly retrievable, which
   * is what the preview iframe and Download button need.
   */
  upload(file: File, onProgress?: (pct: number) => void): Promise<CloudinaryUploadResult> {
    return new Promise((resolve, reject) => {
      if (!this.isConfigured()) {
        reject(new Error('Cloudinary is not configured. Add cloudName + uploadPreset to environment.ts'));
        return;
      }

      const { cloudName, uploadPreset } = environment.cloudinary;
      const endpoint = this.endpointFor(file);
      const url = `https://api.cloudinary.com/v1_1/${cloudName}/${endpoint}/upload`;

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
          const resourceType = (res.resource_type as 'image' | 'raw' | 'video') || 'raw';
          resolve({
            publicId: res.public_id,
            url: res.secure_url,
            thumbnailUrl:
              resourceType === 'image' ? this.thumbnailUrl(res.public_id) : '',
            format: res.format,
            width: res.width,
            height: res.height,
            bytes: res.bytes,
            resourceType,
            originalFilename: res.original_filename || file.name,
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

  /**
   * Picks the Cloudinary upload endpoint based on the file's mime and
   * extension. PDFs / docs / spreadsheets / zips / txt all go through
   * /raw/upload so they don't get filtered by the image-resource PDF
   * restriction (see upload() docstring). Falls back to raw for any
   * unrecognized type so previously-broken formats now work by
   * default — matches the spirit of /auto/upload without inheriting
   * its PDF-as-image quirk.
   */
  private endpointFor(file: File): 'image' | 'video' | 'raw' {
    const mime = (file.type || '').toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    // Some browsers report empty mime for less common formats; sniff
    // by extension too so a .heic / .webp always lands on /image and
    // a bare .csv falls to /raw.
    const name = file.name.toLowerCase();
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.bmp', '.heic', '.heif'];
    const videoExts = ['.mp4', '.mov', '.webm', '.mkv', '.avi'];
    if (imageExts.some((e) => name.endsWith(e))) return 'image';
    if (videoExts.some((e) => name.endsWith(e))) return 'video';
    return 'raw';
  }
}
