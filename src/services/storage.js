import fs from 'node:fs';
import path from 'node:path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { config } from '../config/index.js';

const localDir = path.resolve(config.uploadDir);
if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });

let s3 = null;
if (config.r2Enabled) {
  s3 = new S3Client({
    region: 'auto',
    endpoint: config.r2Endpoint,
    credentials: {
      accessKeyId: config.r2AccessKeyId,
      secretAccessKey: config.r2SecretAccessKey,
    },
  });
}

/** 'r2' إن كانت متغيرات R2 مضبوطة، وإلا 'local' (تخزين قرص - للتطوير فقط). */
export const storageBackend = s3 ? 'r2' : 'local';

// بلا R2 نخزّن محلياً بمفتاح مسطّح (تحويل "/" إلى "_") حتى لا نحتاج مجلدات
// فرعية - مفيد فقط للتطوير المحلي بدون حساب R2 حقيقي.
function localPathFor(key) {
  return path.join(localDir, key.replace(/\//g, '_'));
}

export async function putObject(key, buffer, contentType) {
  if (s3) {
    await s3.send(
      new PutObjectCommand({
        Bucket: config.r2Bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return;
  }
  await fs.promises.writeFile(localPathFor(key), buffer);
}

/** يُعيد Buffer أو null إن لم يوجد الملف. */
export async function getObjectBuffer(key) {
  if (s3) {
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: config.r2Bucket, Key: key }));
      const chunks = [];
      for await (const chunk of res.Body) chunks.push(chunk);
      return Buffer.concat(chunks);
    } catch (err) {
      if (err.name === 'NoSuchKey') return null;
      throw err;
    }
  }
  const p = localPathFor(key);
  if (!fs.existsSync(p)) return null;
  return fs.promises.readFile(p);
}

export async function deleteObject(key) {
  if (s3) {
    await s3.send(new DeleteObjectCommand({ Bucket: config.r2Bucket, Key: key })).catch(() => {});
    return;
  }
  const p = localPathFor(key);
  await fs.promises.unlink(p).catch(() => {});
}
