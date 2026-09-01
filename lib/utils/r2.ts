import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";

function getClient(): S3Client {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Cloudflare R2 credentials are not configured. Set CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, and CLOUDFLARE_R2_SECRET_ACCESS_KEY in your .env");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function uploadToR2(
  body: Buffer | Uint8Array,
  key: string,
  contentType: string
): Promise<string> {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME || "dml-score";
  const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL?.replace(/\/$/, "");

  if (!publicUrl) {
    throw new Error("CLOUDFLARE_R2_PUBLIC_URL is not set. Enable the Public Development URL or add a custom domain in R2 bucket settings.");
  }

  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Keys are timestamped and never rewritten — safe to cache forever.
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return `${publicUrl}/${key}`;
}

export async function deleteFromR2(key: string): Promise<void> {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME || "dml-score";
  const client = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** Every image ever uploaded for this shop, newest first — powers the "pick an existing image" browser. */
export async function listShopImages(shop: string): Promise<{ key: string; url: string; uploadedAt: string }[]> {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME || "dml-score";
  const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL?.replace(/\/$/, "");
  if (!publicUrl) {
    throw new Error("CLOUDFLARE_R2_PUBLIC_URL is not set. Enable the Public Development URL or add a custom domain in R2 bucket settings.");
  }

  const client = getClient();
  const out: { key: string; url: string; uploadedAt: string }[] = [];
  let continuationToken: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: `${shop}/`, ContinuationToken: continuationToken })
    );
    for (const obj of res.Contents ?? []) {
      if (!obj.Key) continue;
      out.push({ key: obj.Key, url: `${publicUrl}/${obj.Key}`, uploadedAt: (obj.LastModified ?? new Date(0)).toISOString() });
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  out.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  return out;
}
