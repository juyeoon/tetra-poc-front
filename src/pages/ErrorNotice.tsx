import { getErrorNotice } from '../lib/errorNotice'

// 에러 화면은 화면설계서에 없어 최소 구성(문구 + 필요할 때만 새로고침 버튼)으로 둔다.
// 문구는 error.code별로 lib/errorNotice.ts에서 고른다.
export default function ErrorNotice({ error }: { error: unknown }) {
  const { message, canReload } = getErrorNotice(error)
  return (
    <div className="page page-center">
      <p>{message}</p>
      {canReload && (
        <button className="primary-button" onClick={() => window.location.reload()}>
          새로고침
        </button>
      )}
    </div>
  )
}
