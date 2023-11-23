import {S3} from '@aws-sdk/client-s3';
import FS from 'fs';
import Path from 'path';
import {syncS3Object} from './syncS3Object';

interface UploadOptions {
  Bucket: string;
  Key?: string;
  LocalPath?: string;
}

export async function syncS3Dir(
  s3: S3,
  {Bucket, Key = undefined, LocalPath = './output'}: UploadOptions,
): Promise<void> {
  if ((await FS.promises.lstat(LocalPath)).isDirectory()) {
    await Promise.all(
      (await FS.promises.readdir(LocalPath)).map(file => {
        return syncS3Dir(s3, {
          Bucket: Bucket,
          Key: Key ? Path.join(Key, file) : file,
          LocalPath: Path.join(LocalPath, file),
        });
      }),
    );
  } else {
    await syncS3Object(s3, {
      Key: Key || Path.basename(LocalPath),
      Bucket: Bucket,
      Body: await FS.promises.readFile(LocalPath),
    });
  }
}
