export const environment = {
  production: true,
  // Production API base. Set NX_API_BASE at build time on Vercel OR replace
  // this value with the deployed Heroku URL.
  // Example: 'https://seo-platform-api.herokuapp.com/api'
  apiBase: 'https://seo-platform-api.herokuapp.com/api',
  cloudinary: {
    cloudName: 'dy4rncf4y',
    uploadPreset: 'seo_platform_tasks',
  },
};
