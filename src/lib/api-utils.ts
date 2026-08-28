export function apiOk<T>(data: T, statusCode = 200) {
  return new Response(
    JSON.stringify({
      success: true,
      ...data,
    }),
    {
      status: statusCode,
      headers: { "Content-Type": "application/json" },
    }
  );
}

export function apiError(message: string, statusCode = 400) {
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
    }),
    {
      status: statusCode,
      headers: { "Content-Type": "application/json" },
    }
  );
}
