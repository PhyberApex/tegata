export interface CreateUserForm {
  username: string
  displayname: string
  email: string
  password: string
  groups: string[]
}

export interface EditUserForm {
  username: string
  displayname: string
  email: string
  groups: string[]
}

export interface ResetLinkForm {
  expiresInDays: number
  sendEmail: boolean
}

export interface CreateInviteForm {
  groups: string[]
  expiresInDays: number
  email: string
  displayname: string
  bundleName: string | null
  sendEmail: boolean
}
