/**
 * Event Utilities
 * Simplified event creation and dispatching
 */

/**
 * Dispatch a custom event from the document
 * @param eventName - Name of the event to dispatch
 * @param detail - Optional payload to include in the event
 */
export function dispatch<T>(eventName: string, detail?: T) {
  document.dispatchEvent(
    new CustomEvent(eventName, {
      detail,
      bubbles: true,
      composed: true,
    })
  );
}

/**
 * Dispatch a custom event from a specific target
 * @param target - The event target to dispatch from
 * @param eventName - Name of the event to dispatch
 * @param detail - Optional payload to include in the event
 */
export function dispatchFrom<T>(target: EventTarget, eventName: string, detail?: T) {
  target.dispatchEvent(
    new CustomEvent(eventName, {
      detail,
      bubbles: true,
      composed: true,
    })
  );
}
