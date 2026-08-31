/**
 * Contratos de eventos de dominio: solo tipos y nombres, sin lógica.
 * Ver docs/ARCHITECTURE.md ("Eventos de dominio como columna vertebral").
 * Los productores (posts, social, chat...) y consumidores (ranking, notifications)
 * se implementan en fases posteriores; este módulo solo fija el contrato compartido.
 */

export const DOMAIN_EVENTS = {
  POST_CREATED: 'post.created',
  POST_LIKED: 'post.liked',
  POST_UNLIKED: 'post.unliked',
  POST_SAVED: 'post.saved',
  POST_UNSAVED: 'post.unsaved',
  POST_SHARED: 'post.shared',
  COMMENT_CREATED: 'comment.created',
  MESSAGE_SENT: 'message.sent',
  USER_FOLLOWED: 'user.followed',
} as const;

export type DomainEventName = (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];

export interface PostCreatedEvent {
  postId: string;
  authorId: string;
  tags: string[];
}

export interface PostLikedEvent {
  postId: string;
  postAuthorId: string;
  userId: string;
  tags: string[];
}

export interface PostUnlikedEvent {
  postId: string;
  postAuthorId: string;
  userId: string;
  tags: string[];
}

export interface PostSavedEvent {
  postId: string;
  postAuthorId: string;
  userId: string;
  tags: string[];
}

export interface PostUnsavedEvent {
  postId: string;
  postAuthorId: string;
  userId: string;
  tags: string[];
}

export interface PostSharedEvent {
  postId: string;
  postAuthorId: string;
  userId: string;
  tags: string[];
  conversationId: string;
}

export interface CommentCreatedEvent {
  commentId: string;
  postId: string;
  postAuthorId: string;
  authorId: string;
}

export interface MessageSentEvent {
  messageId: string;
  conversationId: string;
  senderId: string;
  recipientIds: string[];
}

export interface UserFollowedEvent {
  followerId: string;
  followedId: string;
}
