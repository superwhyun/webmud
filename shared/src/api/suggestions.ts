export interface SuggestionDto {
  id: number;
  authorName: string;
  title: string;
  content: string;
  createdAt: string;
  upCount: number;
  downCount: number;
  myVote: 'up' | 'down' | null;
  isOwner: boolean;
}

export interface SuggestionPageDto {
  suggestions: SuggestionDto[];
  total: number;
  page: number;
  pageSize: number;
}
