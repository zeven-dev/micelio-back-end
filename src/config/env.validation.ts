import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  CORS_ORIGIN: Joi.string().optional(),

  DATABASE_URL: Joi.string().required(),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  UPLOAD_MAX_IMAGE_MB: Joi.number().positive().default(15),
  UPLOAD_MAX_VIDEO_MB: Joi.number().positive().default(250),
  UPLOAD_MAX_TEXT_MB: Joi.number().positive().default(5),
  UPLOAD_MAX_AVATAR_MB: Joi.number().positive().default(5),

  AWS_REGION: Joi.string().required(),
  AWS_S3_BUCKET: Joi.string().required(),
  AWS_ACCESS_KEY_ID: Joi.string().required(),
  AWS_SECRET_ACCESS_KEY: Joi.string().required(),
  AWS_S3_ENDPOINT: Joi.string().uri().optional().allow(''),
  AWS_S3_FORCE_PATH_STYLE: Joi.string().valid('true', 'false').default('false'),
  AWS_S3_SIGNED_URL_EXPIRES_IN: Joi.number().default(300),
});
