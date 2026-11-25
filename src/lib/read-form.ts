/**
 * The form of a POST, or `null` when the body is not one (JSON, empty, broken multipart): `formData()` throws then, and
 * the route answers with a clean `validation_failed` redirect instead of a 500. A scanner can send such bodies in a
 * loop, so this is a warning without the stack, not an error.
 */
export async function readForm(request: Request): Promise<FormData | null> {
  try {
    return await request.formData();
  } catch (error) {
    // eslint-disable-next-line no-console -- the cause of an unreadable request body must reach the log
    console.warn("Form body not readable", { contentType: request.headers.get("content-type"), cause: error });
    return null;
  }
}
