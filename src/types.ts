interface R {
  ok: boolean
  message: string
  data: unknown
}

interface RetOk<T> extends R {
  ok: true
  data: T
}

interface RetNok extends R {
  ok: false
  data: null
}

export type Ret<T> = RetOk<T> | RetNok
