import { HeartHandshake, Sparkles } from 'lucide-react'
import { coreCpProfiles } from '../../data/cpProfiles'

export function CoreCpProfiles() {
  return (
    <section className="core-cp-section" aria-label="三对核心 CP 设定卡片">
      <div className="core-cp-head">
        <div>
          <span className="core-cp-kicker">
            <HeartHandshake size={15} />
            四时代百合群像
          </span>
          <h3>三对核心 CP 设定</h3>
          <p>
            先把最新定稿的三对名字、关系底色和命名逻辑放进小窝。年龄、具体身份和四时代转世细节还没定的地方，页面只标记待补完，不替妹妹乱写死。
          </p>
        </div>
        <div className="core-cp-count">
          <strong>{coreCpProfiles.length}</strong>
          <span>组 CP</span>
        </div>
      </div>

      <div className="core-cp-stack">
        {coreCpProfiles.map((profile, index) => (
          <details className="core-cp-card" key={profile.id} open={index === 0}>
            <summary className="core-cp-summary">
              <span className="core-cp-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="core-cp-summary-main">
                <strong>{profile.pairName}</strong>
                <small>
                  {profile.trope} / {profile.dynamic}
                </small>
              </span>
              <span className="core-cp-summary-tags">
                {profile.tags.slice(0, 3).map((tag) => (
                  <em key={tag}>{tag}</em>
                ))}
              </span>
            </summary>

            <div className="core-cp-card-body">
              <p className="core-cp-world">
                {profile.mainWorld} / {profile.status === 'confirmed' ? '基础设定已确认' : '部分信息待补完'}
              </p>
              <p className="core-cp-premise">{profile.intro}</p>

              <section className="core-cp-core">
                <span>
                  <Sparkles size={14} />
                  命名逻辑
                </span>
                <p>{profile.nameLogic}</p>
              </section>

              <div className="core-cp-characters">
                {profile.characters.map((character) => (
                  <section key={character.name}>
                    <strong>
                      {character.name}（{character.nickname}）
                    </strong>
                    <span>
                      {character.role} / {character.archetype} / {character.gongShou}
                      {character.age ? ` / ${character.age} 岁` : ' / 年龄待定'}
                    </span>
                    <p>{character.profile}</p>
                  </section>
                ))}
              </div>

              <section className="core-cp-core">
                <span>
                  <Sparkles size={14} />
                  关系核心
                </span>
                <p>{profile.relationshipArc}</p>
              </section>

              <footer className="core-cp-footer">
                <div>
                  <strong>待定边界</strong>
                  <p>{profile.pending.length > 0 ? profile.pending.join('；') : '第一对的名字、年龄、攻受与修仙初始身份已确认，其他时代版本后续再补。'}</p>
                </div>
                <div className="core-cp-tags">
                  {profile.keywords.map((keyword) => (
                    <span key={keyword}>{keyword}</span>
                  ))}
                </div>
              </footer>
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}
