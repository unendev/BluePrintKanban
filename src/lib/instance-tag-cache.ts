import { getApiUrl } from "./api";

export interface InstanceTag {
  id: string;
  name: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

let instanceTagsCache: InstanceTag[] = [];
let isCacheReady = false;
let cachePromise: Promise<InstanceTag[]> | null = null;

const CACHE_KEY = 'instance_tag_cache';
const CACHE_TIMESTAMP_KEY = 'instance_tag_cache_timestamp';
const CACHE_DURATION = 2 * 60 * 60 * 1000;

export const InstanceTagCache = {
  loadFromStorage(): InstanceTag[] | null {
    try {
      if (typeof window === 'undefined') return null;
      const cached = localStorage.getItem(CACHE_KEY);
      const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
      if (cached && timestamp) {
        const age = Date.now() - parseInt(timestamp);
        if (age < CACHE_DURATION) {
          const data = JSON.parse(cached) as InstanceTag[];
          instanceTagsCache = data;
          isCacheReady = true;
          return data;
        } else {
          localStorage.removeItem(CACHE_KEY);
          localStorage.removeItem(CACHE_TIMESTAMP_KEY);
        }
      }
    } catch (error) {
      console.error('加载事务项本地缓存失败:', error);
    }
    return null;
  },

  saveToStorage(data: InstanceTag[]): void {
    try {
      if (typeof window === 'undefined') return;
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
    } catch (error) {
      console.error('保存事务项本地缓存失败:', error);
    }
  },

  async preload(userId: string = 'user-1'): Promise<InstanceTag[]> {
    if (cachePromise) return cachePromise;
    const cachedData = this.loadFromStorage();
    if (cachedData) return cachedData;
    return this.fetchFromServer(userId);
  },

  async fetchFromServer(userId: string = 'user-1'): Promise<InstanceTag[]> {
    cachePromise = fetch(getApiUrl(`/api/instance-tags?userId=${userId}`), { credentials: 'include' })
      .then(res => res.json())
      .then((data: InstanceTag[]) => {
        instanceTagsCache = data;
        isCacheReady = true;
        this.saveToStorage(data);
        return data;
      })
      .catch(error => {
        console.error('获取事务项数据失败:', error);
        // 如果失败，尝试返回缓存（即使过期）
        return this.loadFromStorage() || [];
      });
    return cachePromise;
  },

  getInstanceTags(): InstanceTag[] {
    return instanceTagsCache;
  },

  isReady(): boolean {
    return isCacheReady;
  },

  addInstanceTag(tag: InstanceTag): void {
    instanceTagsCache = [...instanceTagsCache, tag];
    this.saveToStorage(instanceTagsCache);
  },

  removeInstanceTag(tagId: string): void {
    instanceTagsCache = instanceTagsCache.filter(tag => tag.id !== tagId);
    this.saveToStorage(instanceTagsCache);
  },

  updateInstanceTags(tags: InstanceTag[]): void {
    instanceTagsCache = tags;
    this.saveToStorage(tags);
  },

  clear(): void {
    instanceTagsCache = [];
    isCacheReady = false;
    cachePromise = null;
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(CACHE_TIMESTAMP_KEY);
      }
    } catch (error) {
      console.error('清除事务项本地缓存失败:', error);
    }
  }
};
