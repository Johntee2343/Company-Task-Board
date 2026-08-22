export const companyTaskBoardSchema = {
  accounts: ["id", "user_id", "email", "display_name", "role", "account_status", "created_at", "updated_at"],
  taskStatuses: ["id", "name", "category", "color", "sort_order", "active", "created_at", "updated_at"],
  tags: ["id", "name", "color", "active", "created_at", "updated_at"],
  tasks: ["id", "title", "description", "priority", "status", "status_id", "visibility", "completed_at", "due_date", "assignee", "created_by", "created_at", "updated_at"],
  taskTags: ["task_id", "tag_id"],
  comments: ["id", "task_id", "author_email", "author_name", "author_user_id", "body", "created_at"],
  auditLogs: ["id", "actor_user_id", "actor_email", "action", "entity_type", "entity_id", "details", "created_at"],
} as const;
