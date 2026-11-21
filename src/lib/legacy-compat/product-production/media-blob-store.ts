import Dexie from 'dexie';
import type { MediaBlobObjectRecordV1 } from '../../types/index';

export async function sha256MediaData(data: ArrayBuffer): Promise<string> {
  const digestPromise = crypto.subtle.digest('SHA-256', data)
  const digest = Dexie.currentTransaction ? await Dexie.waitFor(digestPromise) : await digestPromise
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function parseControlledOpfsPath(path: string): string[] {
  const segments = path.split('/').filter(Boolean)
  if (segments.length < 4 || segments[0] !== 'storyforge' || segments[1] !== 'media' || segments[2] !== 'v1'
    || segments.some(segment => segment === '.' || segment === '..' || !/^[A-Za-z0-9._-]+$/.test(segment))) {
    throw new Error('[product-production] 非法 OPFS 媒资路径')
  }
  return segments
}

async function readOpfsData(path: string): Promise<ArrayBuffer> {
  const getDirectory = navigator.storage?.getDirectory
  if (typeof getDirectory !== 'function') throw new Error('[product-production] 当前浏览器不支持 OPFS')
  const segments = parseControlledOpfsPath(path)
  let directory = await getDirectory.call(navigator.storage)
  for (const segment of segments.slice(0, -1)) directory = await directory.getDirectoryHandle(segment)
  const file = await (await directory.getFileHandle(segments[segments.length - 1])).getFile()
  return file.arrayBuffer()
}

class MediaBlobIntegrityError extends Error {}

async function readPhysicalMediaBlobObjectData(row: MediaBlobObjectRecordV1): Promise<ArrayBuffer> {
  const data = row.backend === 'indexeddb'
    ? row.data
    : row.opfsPath ? await readOpfsData(row.opfsPath) : null
  if (!data) throw new Error('[product-production] 共享媒资物理数据缺失')
  if (data.byteLength !== row.byteSize) throw new MediaBlobIntegrityError('[product-production] 共享媒资大小不匹配')
  if (await sha256MediaData(data) !== row.contentHash) throw new MediaBlobIntegrityError('[product-production] 共享媒资哈希不匹配')
  return data
}

/** Registry export and media resolvers remain read-only and require ready bytes. */
export async function readVerifiedMediaBlobObjectData(row: MediaBlobObjectRecordV1): Promise<ArrayBuffer> {
  if (row.storageState !== 'ready') throw new Error('[product-production] 共享媒资尚未 ready')
  return readPhysicalMediaBlobObjectData(row)
}
