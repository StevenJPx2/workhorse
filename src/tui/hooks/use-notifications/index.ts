/**
 * useNotifications hook exports
 */

export { useNotifications } from "./use-notifications.ts";
export type {
  UseNotificationsOptions,
  UseNotificationsReturn,
  Notification,
  CreateNotificationInput,
  NotificationPriority,
} from "./types.ts";
export { resolveTicketId, handleNotificationError } from "./notification-helpers.ts";
export {
  countUnread,
  filterBlocking,
  markReadInList,
  acknowledgeInList,
  acknowledgeManyInList,
  removeFromList,
  filterByPriority,
  findNewNotifications,
} from "#core/notifications/notification-helpers.ts";
