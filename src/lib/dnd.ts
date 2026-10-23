// dataTransfer types shared by Today's drag and drop (task list, unscheduled
// panel, timeline, to-do list). While dragging, only the types can be read
// (not the values), so a property a drop target must check before the drop
// is carried as a type of its own.

/** A task; the value is its id. */
export const DRAG_ID_TYPE = "application/x-task-id";
/** Added to DRAG_ID_TYPE when the task can go back to the to-do list (Issue #83). */
export const DRAG_MOVABLE_TYPE = "application/x-task-movable";
/** A to-do list item; the value is its id (Issue #83). */
export const BACKLOG_DRAG_TYPE = "application/x-backlog-item-id";

// The dragged row's title for the timeline's drop preview, kept until dragend.
let activeDragTitle: string | null = null;
export function setActiveDragTitle(title: string | null) {
  activeDragTitle = title;
}
export function activeDragTitleOrEmpty(): string {
  return activeDragTitle ?? "";
}
