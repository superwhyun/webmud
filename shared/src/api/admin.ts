export interface AccountDto {
  id: number;
  username: string;
  isBuilder: boolean;
  isAdmin: boolean;
  gold: number | null;
  roomId: number | null;
  roomName: string | null;
}

export interface SessionDto {
  characterName: string;
  roomId: number;
  roomName: string;
}

export interface RoomOptionDto {
  id: number;
  name: string;
  zoneId: number;
  zoneName: string;
}
