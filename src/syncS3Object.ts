import {PutObjectCommandInput, S3} from '@aws-sdk/client-s3';
import Path from 'path';
import {getS3Etag} from './getS3Etag';
import {getS3ObjectVersions} from './getS3ObjectVersions';

interface SyncS3ObjectOptions extends PutObjectCommandInput {
  Body: Buffer;
  Bucket: string;
  Key: string;
}

export interface SyncS3ObjectOutput {
  S3Bucket: string;
  S3Key: string;
  S3ObjectVersion?: string;
}

export async function syncS3Object(
  s3: S3,
  {Bucket, Key, Body, ...request}: SyncS3ObjectOptions,
): Promise<SyncS3ObjectOutput> {
  const objects = await getS3ObjectVersions(s3, Bucket);
  const prevObject = objects.find(object => object.Key === Key);
  const etag = getS3Etag(Body);
  const prevEtag = prevObject?.ETag && JSON.parse(prevObject?.ETag);

  if (!prevObject || prevEtag !== etag) {
    const {VersionId, ETag: actualEtagJson} = await s3.putObject({
      Bucket: Bucket,
      Key: Key,
      Body: Body,
      ContentType: getContentType(Path.extname(Key)),
      ...request,
    });

    const actualEtag = JSON.parse(actualEtagJson ?? '""');
    const expectedETag = getS3Etag(Body);
    if (actualEtag !== expectedETag) {
      throw new Error(
        `ETag mismatch for "${Key}": Expected ${JSON.parse(
          actualEtagJson ?? '',
        )} to equal ${expectedETag}`,
      );
    }

    return {
      S3Bucket: Bucket,
      S3Key: Key,
      S3ObjectVersion: VersionId,
    };
  } else {
    return {
      S3Bucket: Bucket,
      S3Key: Key,
      S3ObjectVersion: prevObject.VersionId,
    };
  }
}

const getContentType = (extension: string) => {
  switch (extension) {
    case '.js':
      return 'application/javascript';
    case '.html':
      return 'text/html';
    case '.txt':
      return 'text/plain';
    case '.json':
      return 'application/json';
    case '.ico':
      return 'image/x-icon';
    case '.svg':
      return 'image/svg+xml';
    case '.css':
      return 'text/css';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.map':
      return 'binary/octet-stream';
    default:
      return 'application/octet-stream';
  }
};
