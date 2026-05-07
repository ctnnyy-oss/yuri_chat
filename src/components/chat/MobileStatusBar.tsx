// 浏览器和系统已经展示真实状态栏；网页内不再模拟时间、信号和电量。

export function MobileStatusBar() {
  return null
}

export function GridDots() {
  return (
    <span className="grid-dots" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}
