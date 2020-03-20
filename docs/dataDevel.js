'use strict';

var params = {
  /* 全体重。各パーツの重さの違いが大きいと、なぜか手とバーとの接合部が
	 引っ張られすぎてしまうので、実際の体重比
	 (http://www.tukasa55.com/staff-blog/?p=5666等)からずらさないといかん */
  total_weight: 68.0,

  /* バーキャッチ動作の許容時間(秒) */
  catch_duration: 5,

  /* バーキャッチ出来る範囲(m) */
  catch_range: 0.3,

  bar: {size: [0.024, 2.4], height: 3.2, // 高めにした。本当は height: 2.8
		mass: 10, color: 0xffffff, spring: 4.5e+4, damping: 5.0e-6},
  floor: {size: [1.5, 0.09, 6.0], color: 0xccdea0},

  // 骨盤
  pelvis: {size: [0.16, 0.10, 0.10], ratio: 0.14, color: 0x0000ff},

  // 脊椎
  spine: {size: [0.14, 0.10, 0.09], ratio: 0.13, color: 0xffffff},

  // 胸
  chest: {size: [0.1505, 0.10, 0.105], ratio: 0.17, color: 0xffffff},

  // 頭
  head: {size: [0.09, 0.14, 0.11], ratio: 0.08, color: 0x888800},

  // 上肢
  upper_leg: {size: [0.08, 0.50], ratio: 0.07, color: 0x888800, x: 0.08},

  // 下肢
  lower_leg: {size: [0.05, 0.60], ratio: 0.07, color: 0x888800, x: 0.065},

  // 上腕
  upper_arm: {size: [0.045, 0.30], ratio: 0.05, color: 0x888800},

  // 下腕
  lower_arm: {size: [0.03, 0.40], ratio: 0.05, color: 0x888800},

  // 手(物理的な実態無し)
  hand: {size: 0.05, color: 0xcc7700},

  // 力(激力)の最大値
  max_impulse: {
	knee: 1.3,            // 膝
	shoulder: 0.8,        // 肩
	shoulder_weak: 0.46,  // 肩 (肩の力を弱くするの設定時)
	elbow: 0.7,           // 肘
	neck: 0.7,            // 首
	breast: 1.1,          // 胸、脊椎の間(英語の breast と chest 違い分らん)
	belly: 1.1,           // 脊椎、骨盤の間
	helper: 200 },        // 初期状態(後振り下しなど)に持っていく時の力

  // 力の最大値 (6DofConstraintは max impulse でなく、max force)
  max_force: {
	hip: [80, 10],        // 尻(懸垂で脚前挙で維持出来るより少し強め)
	hip_init: [200, 200], // 尻(初期状態に持っていく時だけ力持ちにする)
	grip: [8.0, 1.0] },   // 手首

  // 柔軟性
  flexibility: {
	knee: [-4, 170],      // 膝
	shoulder: [-20, 290], // 肩
	elbow: [-2, 150],     // 肘
	neck: [90, 60, 60],   // 首
	breast: [45, 45, 45], // 胸、脊椎の間
	belly: [45, 45, 45],  // 脊椎、骨盤の間
	hip: {                // 尻
	  shift_min: [0, 0, 0],          // 最小ズレ
	  shift_max: [0, 0, 0],          // 最大ズレ
	  angle_min: [-160, -85, -10],   // 最小角度
	  angle_max: [  90,  10,   2] }, // 最大角度
	grip: {
	  shift_min: [0, 0, 0],          // 最小ズレ
	  shift_max: [0, 0, 0],          // 最大ズレ
	  angle_min: [ 0, -30, -170],     // 最小角度
	  angle_max: [-1,  30, 170] },    // 最大角度
  }
};

/* 調整可能なパラメーター */
var adjustable_params = {
  '肩の力を弱く': false,
  'キャッチ時間': params.catch_duration,
  'キャッチ幅': params.catch_range * 100
};

var dousa_dict = {
  '直線': {
	shoulder: [[0, 0.1], [0, 0.1]],
	hip: [[0, 0, 0.2, 0.2], [0, 0, 0.2, 0.2]],
	neck: [0, 0, 0],
	breast: [0, 0, 0],
	belly: [0, 0, 0],
	knee: [[0, 0.1], [0, 0.1]],
	elbow: [[0, 0.1], [0, 0.1]],
	grip: [[0, 0, 0.2, 0.2], [0, 0, 0.2, 0.2]] },
  '押し': {
	shoulder: [[5, 0.3], [5, 0.3]],
	hip: [[4, 0, 0.3, 0.2], [4, 0, 0.3, 0.2]],
	neck: [0, 0, 3],
	breast: [0, 0, 2],
	belly: [0, 0, 2],
	knee: [[0, 0.1], [0, 0.1]],
	elbow: [[0, 0.1], [0, 0.1]],
	grip: [[0, 0, 0.2, 0.2], [0, 0, 0.2, 0.2]] },
  '押し(肩角度有り)': {
	shoulder: [[85, 0.4], [85, 0.4]],
	hip: [[-10, 0, 0.6, 0.2], [-10, 0, 0.6, 0.2]],
	neck: [0, 0, 0],
	breast: [0, 0, 15],
	belly: [0, 0, -15],
	knee: [[0, 0.1], [0, 0.1]],
	elbow: [[0, 0.1], [0, 0.1]],
	grip: [[0, 0, 0.2, 0.2], [0, 0, 0.2, 0.2]] },
  '抜き': {
	shoulder: [[-10, 0.3], [-10, 0.3]],
	hip: [[-15, 0, 0.3, 0.2], [-15, 0, 0.3, 0.2]],
	neck: [0, 0, 3],
	breast: [0, 0, -10],
	belly: [0, 0, -10],
	knee: [[0, 0.1], [0, 0.1]],
	elbow: [[0, 0.1], [0, 0.1]],
	grip: [[0, 0, 0.2, 0.2], [0, 0, 0.2, 0.2]] },
  'あふり': {
	shoulder: [[20, 0.35], [20, 0.35]],
	hip: [[20, 0, 0.1, 0.2], [20, 0, 0.1, 0.2]],
	neck: [0, 0, 5],
	breast: [0, 0, 15],
	belly: [0, 0, 15],
	knee: [[0, 0.1], [0, 0.1]],
	elbow: [[0, 0.1], [0, 0.1]],
	grip: [[0, 0, 0.2, 0.2], [0, 0, 0.2, 0.2]] },
  'あふり終り': {
	shoulder: [[10, 0.8], [10, 0.8]],
	hip: [[10, 0, 0.2, 0.2], [10, 0, 0.2, 0.2]],
	neck: [0, 0, 3],
	breast: [0, 0, 7],
	belly: [0, 0, 7],
	knee: [[0, 0.1], [0, 0.1]],
	elbow: [[0, 0.1], [0, 0.1]],
	grip: [[0, 0, 0.2, 0.2], [0, 0, 0.2, 0.2]] },
  '脚引き寄せ': {
	shoulder: [[40, 0.17], [40, 0.17]],
	hip: [[120, 0, 0.15, 0.2], [120, 0, 0.15, 0.2]],
	neck: [0, 0, 10],
	breast: [0, 0, 35],
	belly: [0, 0, 45],
	knee: [[0, 0.1], [0, 0.1]],
	elbow: [[0, 0.1], [0, 0.1]],
	grip: [[0, 0, 0.2, 0.2], [0, 0, 0.2, 0.2]] },
  '蹴り': {
	shoulder: [[170, 0.15], [170, 0.15]],
	hip: [[60, 0, 0.07, 0.2], [60, 0, 0.07, 0.2]],
	neck: [0, 0, 10],
	breast: [0, 0, 15],
	belly: [0, 0, 15],
	knee: [[0, 0.1], [0, 0.1]],
	elbow: [[0, 0.1], [0, 0.1]],
	grip: [[0, 0, 0.2, 0.2], [0, 0, 0.2, 0.2]] },
  '支持振り出し': {
	shoulder: [[20, 0.25], [20, 0.25]],
	hip: [[20, 0, 0.3, 0.2], [20, 0, 0.3, 0.2]],
	neck: [0, 0, 10],
	breast: [0, 0, 15],
	belly: [0, 0, 15],
	knee: [[0, 0.1], [0, 0.1]],
	elbow: [[0, 0.1], [0, 0.1]],
	grip: [[0, 0, 0.2, 0.2], [0, 0, 0.2, 0.2]] },
  '伸身': {
	hip: [[-5, 0, 0.1, 0.1], [-5, 0, 0.1, 0.1]],
	breast: [0, 0, 7],
	belly: [0, 0, -2],
	knee: [[0, 0.1], [0, 0.1]],
	elbow: [[0, 0.1], [0, 0.1]] },
  '閉脚浮腰': {
	shoulder: [[130, 0.05], [130, 0.05]],
	hip: [[20, 0, 0.22, 0.2], [20, 0, 0.22, 0.2]],
	neck: [0, 0, 0],
	breast: [0, 0, 25],
	belly: [0, 0, 25],
	knee: [[0, 0.1], [0, 0.1]],
	elbow: [[0, 0.1], [0, 0.1]],
	grip: [[0, 0, 0.2, 0.2], [0, 0, 0.2, 0.2]] },
  '開脚': {
	shoulder: [[40, 0.15], [40, 0.15]],
	hip: [[160, 35, 0.1, 0.1], [160, 35, 0.1, 0.1]],
	neck: [0, 0, 5],
	breast: [0, 0, 25],
	belly: [0, 0, 30],
	knee: [[0, 0.1], [0, 0.1]],
	elbow: [[0, 0.1], [0, 0.1]],
	grip: [[0, 0, 0.2, 0.2], [0, 0, 0.2, 0.2]] },
  '背倒立': {
	shoulder: [[35, 0.15], [35, 0.15]],
	hip: [[0, 0, 0.3, 0.3], [0, 0, 0.3, 0.3]],
	neck: [0, 0, 10],
	breast: [0, 0, 5],
	belly: [0, 0, 5],
	knee: [[0, 0.1], [0, 0.1]],
	elbow: [[0, 0.1], [0, 0.1]],
	grip: [[0, 0, 0.2, 0.2], [0, 0, 0.2, 0.2]] },
  '抱え込み(弱)': {
	shoulder: [[130, 0.35], [130, 0.35]],
	hip: [[60, 0, 0.15, 0.2], [60, 0, 0.15, 0.2]],
	neck: [0, 0, -45],
	breast: [0, 0, 15],
	belly: [0, 0, 15],
	knee: [[120, 0.1], [120, 0.1]],
	elbow: [[0, 0.1], [0, 0.1]] },
  '抱え込み(強)': {
	shoulder: [[140, 0.3], [140, 0.3]],
	hip: [[100, 0, 0.15, 0.2], [100, 0, 0.15, 0.2]],
	neck: [0, 0, -45],
	breast: [0, 0, 35],
	belly: [0, 0, 35],
	knee: [[130, 0.1], [130, 0.1]],
	elbow: [[0, 0.1], [0, 0.1]] },
  '屈身(弱)': {
	shoulder: [[130, 0.35], [130, 0.35]],
	hip: [[105, 0, 0.08, 0.2], [105, 0, 0.08, 0.2]],
	neck: [0, 0, -25],
	breast: [0, 0, 15],
	belly: [0, 0, 15],
	knee: [[0, 0.1], [0, 0.1]],
	elbow: [[0, 0.1], [0, 0.1]] },
  '屈身(強)': {
	shoulder: [[130, 0.35], [130, 0.35]],
	hip: [[150, 0, 0.08, 0.2], [150, 0, 0.08, 0.2]],
	neck: [0, 0, -25],
	breast: [0, 0, 15],
	belly: [0, 0, 15],
	knee: [[0, 0.1], [0, 0.1]],
	elbow: [[0, 0.1], [0, 0.1]] },
  '離手': {
	grip: [null, null] },
  '片手離手': {
	grip: [null, [0, 0, 0.2, 0.2]] },
  'バーキャッチ': {
	grip: [true, true] },
  '捻り': {
	shoulder: [[160, 0.6], [160, 0.05]] },
  '着地': {
	shoulder: [[110, 0.1], [110, 0.1]],
	hip: [[40, 0, 0.3, 0.2], [40, 0, 0.3, 0.2]],
	neck: [0, 0, -20],
	breast: [0, 0, 30],
	belly: [0, 0, 20],
	knee: [[70, 0.1], [70, 0.1]],
	elbow: [[0, 0.1], [0, 0.1]],
	landing: true }
};

var waza_list = [
  {	name: '初期状態',
	seq: [['直線']] },
  {	name: '車輪',
	seq: [['押し'], ['抜き'], ['あふり'], ['あふり終り']] },
  {	name: 'ツイスト(調整中。出来ない)',
	seq: [['押し'],
		  ['抜き',
		   { breast: [0, -10, -10], belly: [0, -10, -10],
			 shoulder: [[30, 0.3], [-30, 0.3]] }],
		  ['あふり',
		   { breast: [0, -25, 15], belly: [0, -25, 15],
			 shoulder: [[15, 0.35], [25, 0.35]],
			 hip: [[21, 0, 0.08, 0.2], [19, 0, 0.12, 0.2]] }],
		  ['片手離手', { grip: [null, [30, -160, 0.2, 0.2]] }],
		  ['バーキャッチ'],
		  ['あふり終り']] },
  {	name: '蹴上り',
	seq: [['押し'], ['抜き'], ['脚引き寄せ'], ['蹴り'], ['支持振り出し']] },
  { name: '翻転',
	seq: [
	  ['押し(肩角度有り)',
	   { shoulder: [[140, 0.55], [140, 0.55]],
		 hip: [[-15, 0, 0.6, 0.2], [-15, 0, 0.6, 0.2]],
		 breast: [0, 0, 10] }],
	  ['閉脚浮腰'],
	  ['背倒立',
	   { shoulder: [[60, 0.2], [60, 0.2]],
		 hip: [[0, 0, 0.2, 0.2], [0, 0, 0.2, 0.2]] }],
	  ['押し', { shoulder: [[5, 0.2], [5, 0.2]] }] ]},
  {	name: 'シュタルダー',
	seq: [
	  ['押し(肩角度有り)'],
	  ['開脚'],
	  ['背倒立'],
	  ['押し',
	   { shoulder: [[5, 0.25], [5, 0.25]],
		 hip: [[4, 0, 0.35, 0.35], [4, 0, 0.35, 0.35]] }] ]},
  {	name: 'シュタルダー(減点)',
	seq: [
	  ['押し(肩角度有り)'],
	  ['開脚', { knee: [[20, 0.1], [20, 0.1]] }],
	  ['背倒立'],
	  ['押し',
	   { shoulder: [[5, 0.25], [5, 0.25]],
		 hip: [[4, 0, 0.35, 0.35], [4, 0, 0.35, 0.35]] }] ]},
  {	name: '離手', // 単独の離手や抱え込みは先々捨てても良いかも
	seq: [['離手']] },
  {	name: '片手離手',
	seq: [['片手離手']] },
  {	name: 'バーキャッチ',
	seq: [['バーキャッチ']] },
  {	name: '抱え込み(弱)',
	seq: [['抱え込み(弱)']] },
  {	name: '抱え込み(強)',
	seq: [['抱え込み(強)']] },
  {	name: '屈身(弱)',
	seq: [['屈身(弱)']] },
  {	name: '屈身(強)',
	seq: [['屈身(強)']] },
  {	name: '抱え込み宙返り降り',
	loop: 6,
	seq: [
	  ['押し'],
	  ['抜き', {
		shoulder: [[-25, 0.1], [-25, 0.1]],
		hip: [[-20, 0, 0.15, 0.2], [-20, 0, 0.15, 0.2]] }],
	  ['あふり', {
		shoulder: [[20, 0.2], [20, 0.2]],
		hip: [[25, 0, 0.25, 0.2], [25, 0, 0.25, 0.2]],
		neck: [0, 0, 3],
		breast: [0, 0, 10],
		belly: [0, 0, 5] }],
	  ['離手',{
		shoulder: [[10, 0.2], [10, 0.2]],
		hip: [[10, 0, 0.3, 0.2], [10, 0, 0.3, 0.2]],
		neck: [0, 0, -15] }],
	  ['抱え込み(弱)'],
	  ['伸身',{
		shoulder: [[20, 0.2], [20, 0.2]],
		neck: [0, 0, -25] }],
	  ['着地'] ]},
  {	name: '伸身宙返り半捻り降り',
	loop: 6,
	seq: [
	  ['押し'],
	  ['抜き', {
		shoulder: [[-25, 0.1], [-25, 0.1]],
		hip: [[-20, 0, 0.15, 0.2], [-20, 0, 0.15, 0.2]] }],
	  ['あふり', {
		shoulder: [[20, 0.2], [20, 0.2]],
		hip: [[25, 0, 0.25, 0.2], [25, 0, 0.25, 0.2]],
		neck: [0, 0, 3],
		breast: [0, 0, 10],
		belly: [0, 0, 5] }],
	  ['離手',{
		shoulder: [[10, 0.2], [10, 0.2]],
		hip: [[10, 0, 0.3, 0.2], [10, 0, 0.3, 0.2]],
		neck: [0, 0, -15] }],
	  ['伸身',{
		shoulder: [[20, 0.2], [20, 0.2]],
		neck: [0, 0, -25] }],
	  ['捻り'],
	  ['着地'] ]}
];

export { params, adjustable_params, dousa_dict, waza_list };
