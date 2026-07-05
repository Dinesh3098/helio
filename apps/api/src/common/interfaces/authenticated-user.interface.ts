/**
 * Shape attached to request.user by JwtStrategy after DB verification.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}
