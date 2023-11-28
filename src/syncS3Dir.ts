import {S3} from '@aws-sdk/client-s3';
import FS from 'fs';
import Path from 'path';
import {SyncS3ObjectOutput, syncS3Object} from './syncS3Object';

interface UploadOptions {
  Bucket: string;
  Key?: string;
  LocalPath?: string;
  FileUploadedHandler: (output: SyncS3ObjectOutput & ProgressType) => void;
  Progress?: ProgressType;
}

interface ProgressType {
  total: number;
  done: number;
}

export async function syncS3Dir(
  s3: S3,
  {
    Bucket,
    Key = undefined,
    LocalPath = './output',
    FileUploadedHandler,
    Progress = {total: 0, done: 0},
  }: UploadOptions,
): Promise<void> {
  if ((await FS.promises.lstat(LocalPath)).isDirectory()) {
    await Promise.all(
      (await FS.promises.readdir(LocalPath)).map(async file => {
        await syncS3Dir(s3, {
          Bucket: Bucket,
          Key: Key ? Path.join(Key, file) : file,
          LocalPath: Path.join(LocalPath, file),
          FileUploadedHandler,
          Progress,
        });
      }),
    );
  } else {
    Progress.total++;
    const object = await syncS3Object(s3, {
      Key: Key || Path.basename(LocalPath),
      Bucket: Bucket,
      Body: await FS.promises.readFile(LocalPath),
    });
    Progress.done++;

    FileUploadedHandler({
      ...Progress,
      ...object,
    });
  }
}
