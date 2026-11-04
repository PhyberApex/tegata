export interface InviteValidation {
  valid: boolean
  groups?: string[]
  email?: string
  displayname?: string
}

export interface RegisterFormFields {
  username: string
  displayname: string
  email: string
  password: string
  confirmPassword: string
}

export function passwordMatchError(form: Pick<RegisterFormFields, 'password' | 'confirmPassword'>): string {
  return form.password === form.confirmPassword
    ? ''
    : 'Passwords do not match'
}

export interface InviteFieldsPatch {
  displayname: string
  email: string
  lockedDisplayname: boolean
  lockedEmail: boolean
}

// A field is locked only when the invite response actually supplies a value
// for it — an invite that leaves displayname/email open still lets the
// invitee fill them in themselves.
export function inviteFieldsPatch(current: Pick<RegisterFormFields, 'displayname' | 'email'>, res: InviteValidation): InviteFieldsPatch {
  return {
    displayname: res.displayname ?? current.displayname,
    email: res.email ?? current.email,
    lockedDisplayname: Boolean(res.displayname),
    lockedEmail: Boolean(res.email),
  }
}
