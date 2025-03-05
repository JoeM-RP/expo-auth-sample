import { axiosInstance } from ".";

export const apiError = "apiError";

const logAPIError = (error: any, route?: string | undefined) => {
  if (error.code === "ERR_CANCELED") {
    console.log("[MiddlewareAPIService] canceled request: " + route);
    throw error;
  } else if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    // console.warn(
    //   `[MiddlewareAPIService] /${route} API Error - ${error.response.status}`,
    // );
    // console.warn(error.response.status);
    // error.response.data && console.warn(error.response.data);

    // Consecutive 401 errors are handled by axios in services/index.tsx
    if (error.response.status === 401) {
      if (axiosInstance.defaults.headers.common.authorization) {
        console.debug(
          `[MiddlewareAPIService] attempted call to /${route} with authorization headers set.`,
        );
      } else {
        console.debug(
          `[MiddlewareAPIService] attempted call to /${route} without authorization headers set.`,
        );
      }
    }
  } else if (error.request) {
    // The request was made but no response was received
    console.warn(
      `[MiddlewareAPIService] /${route} API Error - no response: ${error.message}`,
    );
    console.warn("[MiddlewareAPIService] No response");
    console.warn(error.request);
  } else {
    // Something happened in setting up the request that triggered an Error
    console.warn(
      `[MiddlewareAPIService] /${route} API Error - no request: ${error.message}`,
    );
    console.warn(error.stack);
  }
};

export async function getProfileInfoAsync(): Promise<any> {
  const route = "v1.0/me/photo/$value";
  try {
    const response = await axiosInstance.get(route);
    return response.data;
  } catch (error) {
    logAPIError(error, route);

    // Re-throw so the error bubbles up. Could also retun null or empty here to handle a different way
    throw error;
  }
}