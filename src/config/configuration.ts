export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  corsOrigin: process.env.CORS_ORIGIN,
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  // Pesos máximos por tipo de archivo, en MB para que subirlos sea trivial (decisión del
  // dueño del producto). El código los convierte a bytes; nadie hardcodea tamaños.
  // No hay límite de duración para audio/video: se validan solo por peso (ver PRODUCT.md).
  uploads: {
    maxImageMb: parseInt(process.env.UPLOAD_MAX_IMAGE_MB ?? '15', 10),
    maxVideoMb: parseInt(process.env.UPLOAD_MAX_VIDEO_MB ?? '250', 10),
    maxTextMb: parseInt(process.env.UPLOAD_MAX_TEXT_MB ?? '5', 10),
    maxAvatarMb: parseInt(process.env.UPLOAD_MAX_AVATAR_MB ?? '5', 10),
  },
  s3: {
    region: process.env.AWS_REGION,
    bucket: process.env.AWS_S3_BUCKET,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: process.env.AWS_S3_ENDPOINT || undefined,
    forcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE === 'true',
    signedUrlExpiresIn: parseInt(process.env.AWS_S3_SIGNED_URL_EXPIRES_IN ?? '300', 10),
  },
});
