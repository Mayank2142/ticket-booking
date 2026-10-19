type EmailSignInMethods<T> = {
  existingAccount: (email: string, password: string) => Promise<T>;
  verifiedEmail: (email: string, password: string) => Promise<T>;
  verifiedEmailEnabled: () => Promise<boolean>;
  invalidCredentials: (error: unknown) => boolean;
};

/** One form, while preserving the original password login and its role handling. */
export async function signInWithEmail<T>(email: string, password: string, methods: EmailSignInMethods<T>): Promise<T> {
  try {
    return await methods.existingAccount(email, password);
  } catch (error) {
    // Do not send existing passwords to Firebase on network, rate-limit or server failures.
    if (!methods.invalidCredentials(error) || !await methods.verifiedEmailEnabled()) throw error;
    return methods.verifiedEmail(email, password);
  }
}
