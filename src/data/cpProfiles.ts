export interface CpCharacterProfile {
  name: string
  nickname: string
  role: string
  archetype: string
  gongShou: '攻' | '受'
  age: string | null
  profile: string
}

export interface CpProfile {
  id: string
  pairName: string
  names: {
    left: string
    right: string
  }
  nicknames: {
    left: string
    right: string
  }
  trope: string
  dynamic: string
  mainWorld: string
  status: 'confirmed' | 'partly_pending'
  nameLogic: string
  intro: string
  relationshipArc: string
  characters: CpCharacterProfile[]
  keywords: string[]
  pending: string[]
  tags: string[]
}

export const coreCpProfiles: CpProfile[] = [
  {
    id: 'shen-chaoge-gu-wanyin',
    pairName: '沈朝歌 × 顾晚吟',
    names: {
      left: '沈朝歌',
      right: '顾晚吟',
    },
    nicknames: {
      left: '朝朝',
      right: '晚晚',
    },
    trope: '傲娇大小姐 × 自卑忠犬',
    dynamic: '顾晚吟攻，沈朝歌受',
    mainWorld: '初始世界：修仙时代',
    status: 'confirmed',
    nameLogic:
      '沈 / 顾、朝 / 晚、歌 / 吟字字对位。她是清晨高枝上的歌，她是黄昏低声回应的吟。',
    intro:
      '朝是高枝上的歌，晚是低声回应的吟。她是骄矜明艳的贵族小姐，她是卑微沉默的忠犬侍卫。一个嘴硬心软，一个不敢奢望。',
    relationshipArc:
      '自幼相伴的主仆身份差让喜欢变得很难开口。沈朝歌用命令和嫌弃藏在意，顾晚吟用沉默和克制守在她身边，感情在压抑、误会、试探和被选择里慢慢长出来。',
    characters: [
      {
        name: '沈朝歌',
        nickname: '朝朝',
        role: '修仙贵族小姐',
        archetype: '傲娇大小姐',
        gongShou: '受',
        age: '16',
        profile:
          '骄矜、嘴硬、傲娇，外表高贵冷淡，内心其实很柔软。她不能写成纯冰山，重点是大小姐式的别扭、护短和不擅长直说喜欢。',
      },
      {
        name: '顾晚吟',
        nickname: '晚晚',
        role: '贴身侍卫',
        archetype: '自卑忠犬',
        gongShou: '攻',
        age: '15',
        profile:
          '忠诚、克制、卑微守护。她很喜欢沈朝歌，却总觉得自己不配，不敢越界，也不是万能强者，魅力在于沉默里的坚定。',
      },
    ],
    keywords: ['字字对位', '朝晚', '歌吟', '主仆禁忌', '身份差', '青梅相伴', '嘴硬心软', '卑微守护', '慢热救赎'],
    pending: [],
    tags: ['字字对位', '修仙时代', '傲娇大小姐', '自卑忠犬'],
  },
  {
    id: 'wen-shuanghan-ting-luqi',
    pairName: '闻霜寒 × 听露泣',
    names: {
      left: '闻霜寒',
      right: '听露泣',
    },
    nicknames: {
      left: '霜霜',
      right: '露露',
    },
    trope: '冰山美人 × 绿茶',
    dynamic: '听露泣攻，闻霜寒受',
    mainWorld: '跨世界核心 CP，具体时代身份待定',
    status: 'partly_pending',
    nameLogic:
      '闻霜知寒，听露知泣。闻 / 听、霜 / 露、寒 / 泣形成句式对仗，冷、湿、轻、痛都落在名字里。',
    intro:
      '闻霜而知寒，听露而知泣。她像霜雪一样冷，她像露水一样软。一个把心封进寒意里，一个偏要用眼泪和笑意敲开她的门。',
    relationshipArc:
      '一个太冷，一个太会软着靠近。听露泣可以示弱、撒娇、装乖、说漂亮话，但底色是真心；闻霜寒表面无动于衷，实际一次次被扰乱。',
    characters: [
      {
        name: '闻霜寒',
        nickname: '霜霜',
        role: '具体身份待定',
        archetype: '冰山美人',
        gongShou: '受',
        age: null,
        profile:
          '冷淡、克制、疏离，像霜雪一样不可接近。她不是没有感情，而是太会忍、太会压抑，孤独和柔软都藏得很深。',
      },
      {
        name: '听露泣',
        nickname: '露露',
        role: '具体身份待定',
        archetype: '绿茶',
        gongShou: '攻',
        age: null,
        profile:
          '会示弱、会撒娇、会装乖，表面柔软，实际很会进攻。她的茶是为了靠近闻霜寒，不是为了伤害无辜。',
      },
    ],
    keywords: ['句式对仗', '闻霜知寒', '听露知泣', '冰山美人', '绿茶攻', '冷淡克制', '柔软进攻', '双向试探', '慢热融化'],
    pending: ['年龄待定', '四时代具体身份待定', '每一世剧情版本后续补充'],
    tags: ['句式对仗', '冰山美人', '绿茶攻', '待补完'],
  },
  {
    id: 'guyuan-chiyu',
    pairName: '故渊 × 池鱼',
    names: {
      left: '故渊',
      right: '池鱼',
    },
    nicknames: {
      left: '渊渊',
      right: '鱼鱼',
    },
    trope: '不良 × 乖乖女',
    dynamic: '池鱼攻，故渊受',
    mainWorld: '跨世界核心 CP，现代校园最易适配',
    status: 'partly_pending',
    nameLogic:
      '名字直接明牌“池鱼思故渊”。池鱼是被困在池中的鱼，故渊是她真正想回去的自由、深渊、故乡和归处。',
    intro:
      '池鱼思故渊。她是被规矩困住的乖乖女，她是众人眼中危险的不良。可池鱼真正想回去的地方，从来不是安稳的池水，而是那片名为故渊的自由。',
    relationshipArc:
      '乖乖女被不良少女身上的自由吸引，不良少女被乖乖女坚定、干净、温柔的爱一点点击中。重点是规则与逃离、自由与归处、被误解的人终于成为某人的家。',
    characters: [
      {
        name: '故渊',
        nickname: '渊渊',
        role: '具体身份待定',
        archetype: '不良少女',
        gongShou: '受',
        age: null,
        profile:
          '表面叛逆、危险、不服管，可能有伤痕和被误解的过去。她看似会把乖乖女带坏，实际上是池鱼真正向往的自由与归处。',
      },
      {
        name: '池鱼',
        nickname: '鱼鱼',
        role: '具体身份待定',
        archetype: '乖乖女',
        gongShou: '攻',
        age: null,
        profile:
          '温顺、听话、守规矩，却不是软弱小白花。她温柔但主动，乖巧但有韧性，会一步步靠近故渊，把故渊从孤独里拉回来。',
      },
    ],
    keywords: ['典故明牌', '池鱼思故渊', '不良受', '乖乖女攻', '自由与归处', '叛逆外壳', '温柔进攻', '双向救赎', '规则与逃离'],
    pending: ['年龄待定', '四时代具体身份待定', '现代校园版本后续细化'],
    tags: ['典故明牌', '池鱼思故渊', '不良受', '乖乖女攻'],
  },
]
