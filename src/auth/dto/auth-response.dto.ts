export class UserResponseDto {
  id: string;
  email: string;
  name: string | null;
}

export class AuthResponseDto {
  accessToken: string;
  user: UserResponseDto;
}
