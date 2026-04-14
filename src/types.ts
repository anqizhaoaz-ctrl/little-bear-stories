export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  unlikedThemes: string[];
}

export interface StoryRecord {
  id: string;
  title: string;
  content: string;
  type: "寓言" | "成语故事" | "童话" | "民间传说" | "神话";
  originCountry: string;
  imageSearchTerm?: string;
  readAt: number;
  userId: string;
  isRead: boolean;
  isUnliked: boolean;
  isFavorite?: boolean;
}
