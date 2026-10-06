// 모르는 화면 경로. 서버는 404 대신 index.html을 주므로 프런트가 "없는 페이지"를 그린다. (추가지침 02)
// 문구는 화면설계서에 없어 팀이 정했다. 돌아갈 곳은 두지 않는다. (확정)
export default function NotFound() {
  return (
    <div className="page page-center">
      <p>존재하지 않는 페이지입니다.</p>
    </div>
  )
}
