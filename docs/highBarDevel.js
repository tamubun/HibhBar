'use strict';
import * as THREE from './js/three/build/three.module.js';
import { GUI } from './js/three/examples/jsm/libs/dat.gui.module.js';
import { TrackballControls } from
  './js/three/examples/jsm/controls/TrackballControls.js';
import { params, dousa_dict, start_list, waza_list, waza_dict } from
  './dataDevel.js';

/* x軸: 鉄棒の伸びている方向。初期配置の右手方向が +。
   y軸: 上下方向。上が +。
   z軸: 前後方向。後(手前)方向が +。*/

var debug = location.hash == '#debug';
var av; // デバッグ用矢印。

const degree = Math.PI/180;
const L = 0;
const R = 1;
const LR = 2;

/* 詳細編集を使うと、start_list, waza_listに新しい技を追加出来る。
   追加された技か、元から用意された技かは、リスト中の要素番号を PREDEF_*_LEN
   と比較して区別する。 */
const PREDEF_START_LIST_LEN = start_list.length;
const PREDEF_WAZA_LIST_LEN = waza_list.length;

/* 調整可能なパラメーター */
const gui_params = {};

/* 色関係のパラメーターのキー */
const color_params_keys = ['肌の色',  '色1', '色2', '長パン'];

/* ページリロードした時の構成 */
const first_composition = ['後振り下し', '車輪', '車輪'];

/* デバッグ出力用クラス */
const DebugLog = {
  count: 0,
  freq: 0,

  reset: function() {},
  changeFreq: function() {},
  countUp: function() {},
  check_d: function() {},

  reset_d: function() {
    this.count = this.freq = 0;
  },

  changeFreq_d: function() {
    if ( this.freq == 0 )
      this.freq = 20;
    else
      this.freq >>= 1;
    console.log('DebugLog: ' + this.freq );
  },

  countUp_d: function() {
    this.count += 1;
    if ( this.count >= this.freq )
      this.count = 0;
  },

  check_d: function() {
    return this.count == this.freq - 1;
  }
};

if ( debug ) {
  DebugLog.reset = DebugLog.reset_d;
  DebugLog.changeFreq = DebugLog.changeFreq_d;
  DebugLog.countUp = DebugLog.countUp_d;
  DebugLog.check = DebugLog.check_d;
}

/* Ammo.btMatrix3x3 m をデバッグ用に表示する。 */
function showMat(m) {
  var s = [];
  for ( var i = 0; i < 3; ++i ) {
    var r = m.getRow(i);
    s.push(`[${[r.x(), r.y(), r.z()]}]`);
  }
  console.log(`[${s.join(',\n')}]`)
}

/* マウスイベントとタッチイベント両方が起きないようにする。
   タッチイベントが来たら、event.preventDefault()を出す、とか色々試したが、
   環境によって上手く行かず面倒臭くなったので、一回でもタッチイベントが来たら、
   それ以後はマウス関係のイベントは全部無視するようにした */
var touchScreenFlag = false;

var camera, scene, renderer, control;
var physicsWorld;
var clock = new THREE.Clock();
var dousa_clock = new THREE.Clock(); // 一つの動作当りの時間計測
var replayInfo = {  // 再生用情報置き場
  records: [],
  lastDousaPos: 0,
  replayPos: 0,
  remainingDelta: 0
};

var transformAux1;
var rigidBodies = [];
var ammo2Three = new Map();
var ammo2Initial = new Map();

/* state:
     main: 全体状態 'reset', 'init', 'settings', 'run', 'replay', 'pause'
       (pauseはデバッグモード専用)。
     saved_main: pauseしてる時、pause前の状態。
     entry_num: 登録した技の幾つ目を実行中か。
     waza_pos: 技の幾つ目の動作を実行中か。
     active_key: 最後に押したキーのkeycode, 13, 32, null('init'の時)。
     landing:  着地状態。
               0: 床に両足触れてない, 1: 左足が触れてる, 2: 右足, 3:両足触れてる,
               -1: 着地成功, -2: 着地失敗。
 */
var state;

var bar, floor;
var bar_curve, bar_mesh; // バーのスプライン表示用
var bar_spring; // バーの弾性
var pole_object; // 物理的実体無し。表示のみ。

// 足など左右あるパーツは [left_part, right_part] の組。jointも同様。
var pelvis, spine, chest, head,
    upper_leg, lower_leg, upper_arm, lower_arm;

var joint_belly, joint_breast, joint_neck,
    joint_hip, joint_knee, joint_shoulder, joint_shoulder6dof,
    joint_elbow,
    joint_landing = [], // 着地用 [left, right]。upsideDown()の中で作る。
    helper_joint;

var hip_motors; // [[left_hip_motor], [right_hip_motor]]
var grip_motors; // [[left_grip_motor], [right_grip_motor]]
var grip_motors_switchst; // スイッチスタンス(ツイストした時)のグリップ

var joint_grip; // [joint_left_grip, joint_right_grip]
var joint_grip_switchst;
var is_switchst = false; // スイッチスタンスか
var shoulder_winding = [0, 0]; // 肩の角度の巻き付き回数(左右)。離手するとリセット
var last_shoulder_angle = [0, 0]; // 前回の肩の角度(-pi .. pi)
var hinge_shoulder = [true, true];  // 左右の肩のジョイントがhingeか。

var curr_dousa = {};
var composition_by_num = []; // 構成を技番号の列で表現
var air_res_parts; // 着地の時空気抵抗を受ける場所

function init() {
  initGUI();
  initData(); // gui_paramsを使うので、initGUI()を先にやらないといけない。
  initInput();
  initButtons();
  initGraphics();
  initPhysics();
  createObjects();
  showComposition();
}

function initData() {
  initStorage();

  for ( var i = 0; i < first_composition.length; ++i ) {
    var list = get_start_or_waza_list(i);
    composition_by_num.push(list.indexOf(first_composition[i]));
  }
}

function initStorage() {
  function unique_name(name, list) {
    /* バージョンアップでユーザー定義していた技と同名の技が公式版に追加された場合のケア。
       元のユーザー定義の技名の後に '_'を追加して、削除したり名前を変えられる様にする。
       一つ以上の'_'で終わる技をユーザーが登録しているかも知れないので注意。*/
    while ( list.indexOf(name) >= 0 )
      name += '_';
    return name;
  }

  var storage = localStorage.getItem('HighBar');
  var need_update = false;

  if ( storage === null ) {
    storage = {
      user_start_list: [],
      user_waza_list: [],
      colors: {}
    };
    localStorage.setItem('HighBar', JSON.stringify(storage));
  } else {
    storage = JSON.parse(storage);
    if ( !('colors' in storage) ) {
      // colors の項目は新しい版から追加された。
      need_update = true;
      storage['colors'] = {};
    }
  }

  for ( var item of storage['user_start_list'] ) {
    var waza = unique_name(item.waza, start_list), seq = item.seq;
    need_update |= (waza != item.waza);
    start_list.push(waza);
    waza_dict[waza] = seq;
  }

  for ( var item of storage['user_waza_list'] ) {
    var waza = unique_name(item.waza, waza_list), seq = item.seq;
    need_update |= (waza != item.waza);
    waza_list.push(waza);
    waza_dict[waza] = seq;
  }

  for ( var item in storage.colors )
    gui_params[item] = storage.colors[item];

  if ( need_update )
    updateStorage();
}

function initGUI() {
  function resetParam() {
    for ( key in params.adjustable )
      gui_params[key] = params.adjustable[key][0];
  }

  var gui = new GUI({ autoPlace: false }),
      folder1 = gui.addFolder('力の調整'),
      folder2 = gui.addFolder('その他'),
      folder3 = gui.addFolder('色'),
      key;

  resetParam();
  for ( key of ['首の力', '肩の力', '胸の力', '腹の力', '肘の力', '膝の力',
                '屈身にする時間', '腰の力の最大値', '手首の力の最大値'] )
    folder1.add(gui_params, key, ...params.adjustable[key][1]).listen();
  for ( key of ['時間の流れ', 'キャッチ時間', 'キャッチ幅',
                '着地空気抵抗', '着地補助範囲',
                'バー弾性', 'バー減衰', 'マット摩擦'] )
    folder2.add(gui_params, key, ...params.adjustable[key][1]).listen();

  for ( key of ['肌の色',  '色1', '色2'])
    folder3.addColor(gui_params, key).listen();
  folder3.add(gui_params, '長パン').listen();

  gui_params['初期値にリセット'] =
    function() { if ( confirm() ) resetParam(); };
  gui.add(gui_params, '初期値にリセット');

  document.getElementById('gui').appendChild(gui.domElement);
}

function setColors() {
  var skin_color = gui_params['肌の色'],
      color1 = gui_params['色1'],
      color2 = gui_params['色2'],
      leg_color =  gui_params['長パン'] ? color2 : skin_color,
      obj;

  for ( var x of [upper_arm[L], upper_arm[R], lower_arm[L], lower_arm[R]]) {
    obj = ammo2Three.get(x);
    obj.material.color.set(skin_color);
  }
  obj = ammo2Three.get(head).children[0];
  obj.material.color.set(skin_color);

  for ( var x of [spine, chest] ) {
    obj = ammo2Three.get(x);
    obj.material.color.set(color1);
  }

  obj = ammo2Three.get(pelvis);
  obj.material.color.set(color2);

  /* 足の色を短パン、長パンに合うように決める。

     指摘があるまで、鉄棒なのに短パンを履いていた。恥ずかしい。
     各種の説明動画などを作り直したり、色が違っていると断りを入れるのは大変なので、
     デフォルトでは短パンを履いたままにして、
     GUIで指定した時だけ長パンを履くようにして誤魔化すことにした。 */
  for ( var x of [upper_leg[L], upper_leg[R], lower_leg[L], lower_leg[R]] ) {
    obj = ammo2Three.get(x);
    obj.material.color.set(leg_color);
  }

  updateStorage(); // 修正が無くても毎回呼ぶが気にしない。
}

function setAdjustableForces() {
  params.max_force.hip[0] = gui_params['腰の力の最大値'];
  dousa_dict['屈身(弱)']['hip'][0][2] =
    dousa_dict['屈身(弱)']['hip'][1][2] =
    dousa_dict['屈身(強)']['hip'][0][2] =
    dousa_dict['屈身(強)']['hip'][1][2] = gui_params['屈身にする時間'];
  setHipMaxMotorForce(...params.max_force.hip);

  joint_neck.setMaxMotorImpulse(gui_params['首の力']);
  joint_breast.setMaxMotorImpulse(gui_params['胸の力']);
  joint_belly.setMaxMotorImpulse(gui_params['腹の力']);

  var shoulder_impulse = gui_params['肩の力'],
      elbow_impulse = gui_params['肘の力'],
      knee_impulse = gui_params['膝の力'],
      grip_max_force = gui_params['手首の力の最大値'];

  for ( var lr = L; lr <= R; ++lr ) {
    /* bulletのソースから多分、
       btHingeConstraint.enableAngularMotor() の maxMotorImpulse と
       btGeneric6DofConstraint の rotationLimitMotor の maxMotorForce は、
       maxMotorFoce / fps = maxMotorImpulse
       の関係にあると思う。
       但し、fpsは physicsWorld.stepSimulation() の fixedTimeStep 。

       rotationLimitMotor の maxLimitForceは?
    */
    joint_shoulder[lr].enableAngularMotor(
      hinge_shoulder[lr], 0, shoulder_impulse);
    for ( var xyz = 0; xyz < 3; ++xyz ) {
      var motor= joint_shoulder6dof[lr].getRotationalLimitMotor(xyz);
      motor.m_maxMotorForce = shoulder_impulse * params.fps;
      motor.m_enableMotor = !hinge_shoulder[lr];
    }

    joint_elbow[lr].enableAngularMotor(true, 0, elbow_impulse);
    joint_knee[lr].enableAngularMotor(true, 0, knee_impulse);
  }
  setGripMaxMotorForce(grip_max_force, params.max_force.grip[1]);

  var spring = gui_params['バー弾性'] * 1e+4,
      damping = gui_params['バー減衰'] * 1e-6;
  bar_spring.setStiffness(1, spring);
  bar_spring.setDamping(1, damping);
  bar_spring.setStiffness(2, spring);
  bar_spring.setDamping(2, damping);

  var friction = gui_params['マット摩擦'];
  floor.setFriction(friction);
  floor.setRollingFriction(friction);
}

function initInput() {
  var updown = function(ev) {
    var key = ev.keyCode;
    if ( state.main == 'settings' ) {
      return;
    } else if ( state.main == 'init' ) {
      state = {
        main: 'run', entry_num: 1, waza_pos: 0, active_key: key, landing: 0 };
      changeButtonSettings();
      for ( var blur of document.querySelectorAll('.blur')) {
        blur.blur();
      }

      setAdjustableForces();
      enableHelper(false);
      startRecording();
    } else {
      if ( key != state.active_key ) {
        state.active_key = key;
        if ( state.entry_num
             < document.querySelectorAll('select.waza').length ) {
          state.entry_num += 1;
          state.waza_pos = 0;
        } else {
          /* 構成の最後まで進んだら、キーを入れ替えの効果は無しにする。
             これを省くと、再生時に構成の最後以降、activeキーの表示が
             おかしくなる */
          var waza = current_waza(),
              waza_seq = waza_dict[waza];
          if ( ++state.waza_pos >= waza_seq.length )
            state.waza_pos = (waza_seq[waza_seq.length-1][0] != '着地')
            ? 0 : waza_seq.length - 1;
        }
      } else {
        var waza = current_waza(),
            waza_seq = waza_dict[waza];
        if ( ++state.waza_pos >= waza_seq.length )
          state.waza_pos = (waza_seq[waza_seq.length-1][0] != '着地')
          ? 0 : waza_seq.length - 1;
      }
    }

    var d = waza_dict[current_waza()][state.waza_pos],
        next_dousa = dousa_dict[d[0]],
        variation = d[1] || {}; // バリエーションを指定出来るようにしてみる
    for ( var x in next_dousa )
      curr_dousa[x] = next_dousa[x];
    for ( var x in variation )
      curr_dousa[x] = variation[x];

    showActiveWaza();
    addDousaRecord(curr_dousa);
    dousa_clock.start();
  };

  var keydown = function(ev) {
    if ( state.main == 'settings' || state.main == 'replay' )
      return;

    var key = ev.keyCode == 32 ? 'space' : 'enter';
    document.querySelector('button#' + key).classList.toggle('active', true);
    if ( ev.keyCode == state.active_key && state.waza_pos % 2 == 0 )
      return;

    updown(ev);
    addKeyRecord(ev.keyCode); // updown()からstartRecording()が呼ばれる事に注意
  };

  var keyup = function(ev) {
    if ( state.main == 'settings' || state.main == 'replay' )
      return;

    var key = ev.keyCode == 32 ? 'space' : 'enter';
    document.querySelector('button#' + key).classList.toggle('active', false);
    if ( state.waza_pos % 2 == 1 )
      return;

    /* space押したまま、enterを押して技を変えて、それからspaceを放す時に
       反応させない */
    if ( ev.keyCode == state.active_key ) {
      updown(ev);
    }
    addKeyRecord(ev.keyCode | 0x100);
  };

  var keyevent = function(ev) {
    switch ( ev.keyCode ) {
    case 32: // ' ':
    case 13: // Enter
      if ( ev.type == 'keydown' )
        keydown(ev);
      else if ( ev.type == 'keyup' )
        keyup(ev);
      break;
    case 82: // 'R'
    case 114: // 'r'
      if ( state.main == 'run' || state.main == 'replay' ) {
        doReset();
        DebugLog.reset();
      }
      break;
    case 80: // 'P'
    case 112: // 'p'
      // 色々な状態で正しく動作するか確認してないので、デバッグモード専用。
      if ( !debug )
        break;
      if ( ev.type != 'keydown' )
        break;
      if ( state.main == 'pause' ) {
        state.main = state.saved_main;
        clock.start();
      } else {
        state.saved_main = state.main;
        state.main ='pause';
        clock.stop();
      }
      break;
    case 76: // 'L'
    case 108: // 'l'
      if ( ev.type == 'keydown' )
        DebugLog.changeFreq();
      break;
    default:
      break;
    }
  }

  window.addEventListener('keydown', keyevent, false);
  window.addEventListener('keyup', keyevent, false);
  for ( var move of document.querySelectorAll('button.move') ) {
    move.addEventListener('mousedown', function(ev) {
      if ( touchScreenFlag )
        return;
      ev.keyCode = ev.target.getAttribute('id') == 'space' ? 32 : 20;
      keydown(ev);
    }, false);
    move.addEventListener('mouseup', function(ev) {
      if ( touchScreenFlag )
        return;
      ev.keyCode = ev.target.getAttribute('id') == 'space' ? 32 : 20;
      keyup(ev);
    }, false);
    // mousedownのまま、ボタンの外に出てしまった時対応
    move.addEventListener('mouseout', function(ev) {
      if ( touchScreenFlag )
        return;
      ev.keyCode = ev.target.getAttribute('id') == 'space' ? 32 : 20;
      if ( state.main == 'run' )
        keyup(ev);
    }, false);
    // ボタンの外でmousedownのまま、ボタンの中に入ってきた時対応
    move.addEventListener('mouseenter', function(ev) {
      if ( touchScreenFlag )
        return;
      ev.keyCode = ev.target.getAttribute('id') == 'space' ? 32 : 20;
      if ( state.main == 'run' )
        keydown(ev);
    }, false);
    move.addEventListener('touchstart', function(ev) {
      touchScreenFlag = true;
      ev.keyCode = ev.target.getAttribute('id') == 'space' ? 32 : 20;
      keydown(ev);
    }, false);
    move.addEventListener('touchend', function(ev) {
      touchScreenFlag = true;
      ev.keyCode = ev.target.getAttribute('id') == 'space' ? 32 : 20;
      keyup(ev);
    }, false);
  }
}

function initButtons() {
  document.getElementById('reset').addEventListener('click', doReset, false);
  document.getElementById('replay').addEventListener('click', doReplay, false);

  makeWazaSelector();

  document.querySelector('#composition').addEventListener('click', function() {
    document.querySelector('#settings').style.visibility = 'visible';
    state.main = 'settings';
  }, false);

  document.querySelector('#pole-check').addEventListener('change', function() {
    var elem = document.querySelector('#pole-check');
    pole_object.visible = elem.checked;
    // チェックしてアクティブになった以後のスペースキーに反応してしまうのを避ける。
    elem.blur();
  });

  document.querySelector('#settings-ok').addEventListener('click', function() {
    setColors();

    replayInfo.records = [];

    document.querySelector('#settings').style.visibility = 'hidden';
    composition_by_num = [];
    for ( var elem of document.querySelectorAll('.initialize') )
      composition_by_num.push(elem.selectedIndex);
    showComposition();
    state.main = 'init';
    doResetMain();
  }, false);

  document.querySelector('#plus').addEventListener('click', plus, false);
  document.querySelector('#minus').addEventListener('click', minus, false);
  for ( var button of document.querySelectorAll('.edit') )
    button.addEventListener('click', showEdit, false);

  document.querySelector('#textcode-ok').addEventListener('click', function() {
    try {
      var parsed = JSON.parse(
        document.querySelector('#textcode-area').value);
      checkParsed(parsed);
    } catch (error) {
      alertError(error);
      return;
    }

    hideEdit();
    if ( parsed.detail !== undefined )
      parsed.detail = registerWaza(parsed.detail); // ユーザー定義技の追加と削除
    restoreParsed(parsed);
  }, false);

  document.querySelector('#textcode-cancel').addEventListener(
    'click', hideEdit, false);
}

function alertError(error) {
  if ( error instanceof SyntaxError ) {
    /* jsonlint https://github.com/zaach/jsonlint/blob/master/web/jsonlint.js
       を使うと間違った所を教えてくれるらしいが。 */
    alert('記述に間違いがあります。');
    return
  }

  if ( typeof(error) == 'string' ) {
    alert(error);
    return;
  }

  var str = ( 'dousa' in error )
      ? `技名 ${error.waza} 、${error.dousa} 内に間違いがあります。`
      :  `技名 ${error.waza} 内に間違いがあります。`;
  if ( error.message )
    str += ': ' + error.message;
  alert(str);
}

function showEdit() {
  document.querySelector('#settings').style.visibility = 'hidden';
  document.querySelector('#textcode').style.visibility = 'visible';

  var obj = this.hasAttribute('detail') ? detailObj() : briefObj();
  document.querySelector('#textcode-area').value =
    JSON.stringify(obj , null, 2);
}

function getParams() {
  // gui_paramsの内、色関係はlocalStorageに保存するので、編集項目からは外す。
  var cp_params = Object.assign({}, gui_params);
  for ( var key of color_params_keys )
    delete cp_params[key]

  return cp_params;
}

function detailObj() {
  var detail = [];
  for ( var elem of document.querySelectorAll('.initialize') ) {
    var waza = elem.selectedOptions[0].textContent,
        seq = waza_dict[waza];
    detail.push({waza: waza, seq: seq});
  }

  return {params: getParams(), detail: detail};
}

function briefObj() {
  var composition = [];
  for ( var elem of document.querySelectorAll('.initialize') )
    composition.push(elem.selectedOptions[0].textContent);
  return {params: getParams(), composition: composition};
}

function hideEdit() {
  document.querySelector('#textcode').style.visibility = 'hidden';
  document.querySelector('#settings').style.visibility = 'visible';
}

function checkParsed(parsed) {
  if ( !('params' in parsed) )
    throw '"params"の指定がありません。'
  if ( 'composition' in parsed )
    checkComposition(parsed['composition']);
  else if ( 'detail' in parsed )
    checkDetail(parsed['detail']);
  else
    throw '"composition"または"detail"の指定がありません。'
}

function checkComposition(comps) {
  if ( !Array.isArray(comps) )
    throw SyntaxError();
  if ( comps.length <= 1 )
    throw '構成には最低、初期動作と、それ以外の技一つを入れなくてはいけません。';

  for ( var i = 0; i < comps.length; i++ ) {
    var comp = comps[i];
    if ( !strCheck(comp) )
      throw '技名がありません。';

    var list = (i==0 ? start_list : waza_list);
    if ( !list.includes(comp) )
      throw '技名 ' + comp + ' という技は登録されていません。';
  }
}

function checkDetail(detail) {
  if ( !Array.isArray(detail) )
    throw SyntaxError();
  if ( detail.length <= 1 )
    throw '構成には最低、初期動作と、それ以外の技一つを入れなくてはいけません。';

  for ( var i = 0; i < detail.length; ++i ) {
    var di = detail[i];
    if ( !(di instanceof Object) )
      throw SyntaxError();
    var [comp, seq] = [di.waza, di.seq];
    if ( !strCheck(comp) )
       throw '技名がありません。';
    if ( !Array.isArray(seq) )
      throw '技を構成する動作指定がありません。';
    var list = get_start_or_waza_list(i),
        predef_len = get_predef_len(i);
    var index = list.indexOf(comp);
    if ( 0 <= index && index < predef_len) {
      if ( JSON.stringify(seq) != JSON.stringify(waza_dict[comp]) )
          throw `技名 ${comp} が書き換えられています。`;
    } else { // 追加された技
      // seq.length == 0 でもエラーにしない。その時は、その技があれば削除する。
      if ( i == 0 && seq.length > 1 )
        throw '開始姿勢は一つしか指定出来ません。';
      try {
        checkSequence(seq, i);
      } catch (error) {
        error.waza = comp;
        throw error;
      }
    }
  }
}

function checkSequence(seq, waza_i) {
  for ( var seq_i = 0; seq_i < seq.length; ++seq_i ) {
    var dousa = seq[seq_i];
    if ( !Array.isArray(dousa) ||
         dousa.length != 2 ||
         !strCheck(dousa[0]) ||
         !(dousa[1] instanceof Object) )
      throw Error('動作名か調整指定がありません。');

    var [dousa_name, adjustment] = dousa;
    try {
      if ( !(dousa_name in dousa_dict) )
        throw Error('登録されていない動作です。');
      checkAdjustment(adjustment, waza_i);
    } catch (error) {
      error.dousa = `${seq_i + 1}個目の動作 ${dousa_name}`;
      throw error;
    }
  }
}

const checkFuncTable = {
  shoulder: shoulderCheck,
  hip: hipCheck,
  neck: neckCheck,
  breast: breastCheck,
  belly: bellyCheck,
  knee: kneeCheck,
  elbow: elbowCheck,
  grip: gripCheck };

function checkAdjustment(adjustment, waza_i) {
  if ( waza_i == 0 &&
       (!('angle' in adjustment) || typeof(adjustment['angle']) != 'number') )
    throw Error('開始姿勢にはangleを指定する必用があります。');

  for ( var key in adjustment ) {
    var value = adjustment[key];
    var checkFunc = checkFuncTable[key];
    if ( checkFunc == undefined )
      continue; // エラーにしない。コメントとか用。'landing'もここでスルー。
    try {
      if ( !Array.isArray(value) )
        throw Error();
      checkFunc(value);
    } catch (error) {
      throw Error(`調整指定${key}内。`);
    }
  }
}

function shoulderCheck(value) {
  arrayCheck(value, 2, 'array');

  // 肩の角度の指定方法は二通りある。
  for ( var v of value ) {
    if ( v.length == 2 )
      arrayCheck(v, 2, 'number'); // 従来のヒンジ自由度しかない2要素指定
    else
      arrayCheck(v, 6, 'number'); // 全3自由度を持った新しい6要素指定
  }
}

function hipCheck(value) {
  arrayCheck(value, 2, 'array');
  for ( var v of value )
    arrayCheck(v, 4, 'number');
}

function neckCheck(value) {
  coneCheck(value);
}

function breastCheck(value) {
  coneCheck(value);
}

function bellyCheck(value) {
  coneCheck(value);
}

function kneeCheck(value) {
  arrayCheck(value, 2, 'array');
  for ( var v of value )
    arrayCheck(v, 2, 'number');
}

function elbowCheck(value) {
  arrayCheck(value, 2, 'array');
  for ( var v of value )
    arrayCheck(v, 2, 'number');
}

function gripCheck(value) {
  arrayCheck(value, 2, 'grip'); // 特例
}

function coneCheck(value) {
  arrayCheck(value, 3, 'number');
}

function arrayCheck(value, len, elem_type) {
  if ( value.length != len )
    throw Error();

  for ( var e of value ) {
    switch ( elem_type ) {
    case 'array':
      if ( !Array.isArray(e) )
        throw Error();
      break;
    case 'grip':
      if ( typeof(e) == 'string' && ['catch', 'release'].includes(e) )
        break;
      arrayCheck(e, 4, 'number');
      break;
    default:
      if ( typeof(e) != elem_type )
        throw Error();
      return;
    }
  }
}

function strCheck(value) {
  return typeof(value) == 'string' && value != '';
}

function registerWaza(detail) {
  var newDetail = [];
  var list, predef_len;
  var changed = false;

  for ( var i = 0; i < detail.length; ++i ) {
    var d = detail[i],
        [comp, seq] = [d.waza, d.seq];
    list = get_start_or_waza_list(i);
    predef_len = get_predef_len(i);
    var index = list.indexOf(comp);
    if ( 0 <= index && index < predef_len ||
         JSON.stringify(seq) == JSON.stringify(waza_dict[comp]) ) {
      newDetail.push(d);
      continue;
    }

    changed = true;
    if ( seq.length == 0 ) {
      // seqが空の時は技を取り除く。分かりにくい仕様か。
      if ( index >= 0 ) {
        delete waza_dict[comp];
        list.splice(index, 1);

        // 消した穴はデフォルトで埋める。
        var waza = (i == 0) ? '後振り下し' : '車輪';
        newDetail.push({waza: waza, seq: waza_dict[waza]})
      }
    } else {
      if ( index < 0 )
        list.push(comp);
      waza_dict[comp] = seq;
      newDetail.push(d);
    }
  }

  if ( changed ) {
    updateStorage();
  }

  return newDetail;
}

function updateStorage() {
  var user_start_list = [],
      user_waza_list = [],
      colors = {};
  for ( var i = PREDEF_START_LIST_LEN; i < start_list.length; ++i ) {
    var waza = start_list[i];
    user_start_list.push({waza: waza, seq: waza_dict[waza]});
  }
  for ( var i = PREDEF_WAZA_LIST_LEN; i < waza_list.length; ++i ) {
    var waza = waza_list[i];
    user_waza_list.push({waza: waza, seq: waza_dict[waza]});
  }
  for ( var key of color_params_keys )
    colors[key] = gui_params[key];

  var storage = {
    user_start_list: user_start_list,
    user_waza_list: user_waza_list,
    colors: colors
  };
  localStorage.setItem('HighBar', JSON.stringify(storage));
}

function restoreParsed(parsed) {
  for ( var key in gui_params )
    if ( key in parsed['params'] )
      gui_params[key] = parsed['params'][key];

  var comps;
  if ( 'composition' in parsed ) {
    comps = parsed['composition'];
  } else {
    comps = [];
    for ( var d of parsed['detail'] )
      comps.push(d.waza);
  }

  composition_by_num = [];
  for ( var i = 0; i < comps.length; ++i ) {
    var list = get_start_or_waza_list(i);
    composition_by_num.push(list.indexOf(comps[i])); // index >= 0 はチェック済み
  }

  makeWazaSelector();
  var selects = document.querySelectorAll('#settings-list select');
  for ( var i = 0; i < composition_by_num.length; ++i ) {
    selects[i].selectedIndex = composition_by_num[i];
  }
}

function makeWazaSelector() {
  var len = document.querySelectorAll('select.waza').length;
  for ( var i = 1; i < len; ++i )
    minus();

  makeOptions(document.querySelector('#start-pos'), start_list);
  makeOptions(document.querySelector('select.waza'), waza_list);

  for ( var i = 2; i < composition_by_num.length; ++i )
    plus();
}

function makeOptions(sel, list) {
  while (sel.firstChild)
    sel.removeChild(sel.firstChild);

  for ( var waza of list ) {
    var option = document.createElement('option');
    option.textContent = waza;
    sel.appendChild(option);
  }
}

function plus() {
  var clone = document.querySelector('select.waza').cloneNode(true);
  document.getElementById('settings-list').insertBefore(
    clone, document.getElementById('plusminus'));
  document.getElementById('minus').removeAttribute('disabled');
}

function minus() {
  var selects = document.querySelectorAll('select.waza');
  if ( selects.length <= 1 )
    return; // 予備
  else if ( selects.length <= 2 )
    document.getElementById('minus').setAttribute('disabled', true);
  document.getElementById('settings-list').removeChild(
    selects[selects.length-1]);
}

function get_start_or_waza_list(entry_num) {
  return (entry_num == 0) ? start_list : waza_list;
}

function get_predef_len(entry_num) {
  return (entry_num == 0) ? PREDEF_START_LIST_LEN : PREDEF_WAZA_LIST_LEN;
}

function showComposition() {
  var list = document.getElementById('right-list');
  for ( var elem of document.querySelectorAll('#right-list>div') )
    elem.remove();
  for ( var i = 0; i < composition_by_num.length; ++i ) {
    var div = document.createElement('div');
    var waza_list = get_start_or_waza_list(i);
    div.appendChild(
      document.createTextNode(waza_list[composition_by_num[i]]));
    list.append(div);
  }
}

function showActiveWaza() {
  var w = document.querySelectorAll('#right-list>div');
  for ( var i = 0; i < w.length; ++i )
    w[i].classList.toggle('active', i == state.entry_num);
  w[state.entry_num].scrollIntoView(false);
}

function initGraphics() {
  var container = document.getElementById('container');
  camera = new THREE.PerspectiveCamera(
    60, container.offsetWidth / container.offsetHeight, 0.2, 2000);
  camera.position.set(7, 0, 3);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfd1e5);
  renderer = new THREE.WebGLRenderer();
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.offsetWidth, container.offsetHeight);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0x707070));

  if ( debug ) {
    av = [0,1,2].map(xyz => new THREE.ArrowHelper(
      new THREE.Vector3(1,0,0), new THREE.Vector3(0,0,0),2,
      [0xff0000, 0x00ff00, 0x0000ff][xyz]));
    for ( var xyz=0; xyz < 3; ++xyz)
      scene.add(av[xyz]);
  }

  var light = new THREE.DirectionalLight(0x888888, 1);
  light.position.set(3, 8, 0);
  scene.add(light);

  control = new TrackballControls(camera, container);
  control.target.setY(-2.7);
  control.rotateSpeed = 1.0;
  control.zoomSpeed = 1.2;
  control.panSpeed = 0.8;
  control.noZoom = false;
  control.noPan = false;
  control.staticMoving = true;
  control.dynamicDampingFactor = 0.3;
  // カメラの位置を変えても controlが上書きするので、こちらを変える。
  // 行儀良くないかも。
  control.target.set(0, -1., 0);
  control.enabled = true;

  window.addEventListener('resize', onWindowResize, false);
}

function initPhysics() {
  var collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
  var dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
  var broadphase = new Ammo.btDbvtBroadphase();
  var solver = new Ammo.btSequentialImpulseConstraintSolver();
  physicsWorld = new Ammo.btDiscreteDynamicsWorld(
    dispatcher, broadphase, solver, collisionConfiguration);
  physicsWorld.setGravity(new Ammo.btVector3(0, -9.8, 0));
  transformAux1 = new Ammo.btTransform();
}

function createObjects() {
  var [bar_r, bar_l, bar_h] = params.bar.size;
  var pole_r = params.pole.size;
  var [wire_x, wire_y, wire_z] = [
    params.wire.dist_x, params.wire.middle_y_from_top, params.wire.dist_z];
  var [floor_x, floor_y, floor_z] = params.floor.size; // 一辺の1/2
  var pelvis_r2 = params.pelvis.size[1];
  var spine_r2 = params.spine.size[1], spine_m = 0.13;
  var [chest_r1, chest_r2] = params.chest.size; // chest_r3は他では使わない
  var head_r2 = params.head.size[1];
  var upper_leg_h = params.upper_leg.size[1], upper_leg_x = params.upper_leg.x;
  var [lower_leg_r, lower_leg_h] = params.lower_leg.size,
      lower_leg_x = params.lower_leg.x;
  var [upper_arm_r, upper_arm_h] = params.upper_arm.size;
  var lower_arm_h = params.lower_arm.size[1];

  function resizeParams() {
    var scale = params.scale;
    bar_r *= scale; bar_l *= scale; bar_h *= scale
    floor_x *= scale; floor_z *= scale; // yも変えてもいいが
    // barの重さも scale^3 したいが、それをやると弾性なども変えないといかんのでやめる

    pole_r *= scale;
    wire_x *= scale; wire_y *= scale; wire_z *= scale;
  }

  function createShoulderJoint() {
    /* 肩は、HingeConstrと 6DofSpring2Constrの二つのモーター付きジョイントで固定し、
       動作によってどちらか一方のモーターのみを利用する。

       これは、従来、HingeConstrのみで固定していて、各技、各動作のパラメーターを
       そちら用に調整していて、新しく自由度を増やした 6DofConstr用に
       調整し直すのが難しいため。 */
    joint_shoulder = [];
    joint_shoulder6dof = [];

    for ( var lr = L; lr <= R; ++lr ) {
      var sign = (lr == L ? -1 : +1);
      var joint = createHinge(
        chest, [sign * chest_r1, chest_r2, 0], null,
        upper_arm[lr], [-sign * upper_arm_r, -upper_arm_h/2, 0], null, null);
      joint_shoulder.push(joint);

      joint = create6Dof(
        chest, [sign * chest_r1, chest_r2, 0], null,
        upper_arm[lr], [-sign * upper_arm_r, -upper_arm_h/2, 0], null,
        [params.flexibility.shoulder.shift_min,
         params.flexibility.shoulder.shift_max,
         params.flexibility.shoulder.angle_min,
         params.flexibility.shoulder.angle_max],
        null, Ammo.RO_XZY); // btGeneric6DofSpring2Constraint
      joint_shoulder6dof.push(joint);
    }
  }

  resizeParams();

  /* Three.jsの CylinderはY軸に沿った物しか用意されてない。
     X軸に沿うように回転させると、Bulletの方にまでその回転が反映されてしまい
     座標変換がややこしくなるので、画面に見えるバーとBulletに対応付けるバーを
     分けて扱う、という小細工をする。
     物理的なバーはただの円柱。画面に見えるバーはしなっているように見せる。 */
  var dummy_object = new THREE.Mesh(
    new THREE.CylinderBufferGeometry(bar_r, bar_r, bar_l, 1, 1),
    new THREE.MeshPhongMaterial({visible: false})); // 見せない

  var positions = [];
  for ( var i = 0; i < 4; ++i )
    positions.push(new THREE.Vector3(-bar_l/2 + i * bar_l/3, 0, 0));
  bar_curve = new THREE.CatmullRomCurve3(positions);
  bar_curve.curveType = 'catmullrom';
  bar_curve.tension = 0.4;
  bar_mesh = null;

  var shape = new Ammo.btCylinderShapeX(
    new Ammo.btVector3(bar_l/2, bar_r, bar_r));
  bar = createRigidBody(dummy_object, shape, params.bar.mass);

  // 支柱とワイヤーは物理的な実体のないただの飾り。
  pole_object = new THREE.Mesh(
    new THREE.CylinderBufferGeometry(pole_r, pole_r , bar_h+pole_r, 10, 1),
    new THREE.MeshPhongMaterial({color: params.pole.color}));
  var pole_object_ = pole_object.clone();
  pole_object.translateY(-bar_h/2).translateX(bar_l/2);
  pole_object_.translateX(-bar_l);
  pole_object.add(pole_object_);
  pole_object.visible = document.querySelector('#pole-check').checked;
  scene.add(pole_object);
  var points = [];
  for ( var pt of [
    [wire_x, -bar_h/2, wire_z],
    [0, bar_h/2, pole_r],
    [0, bar_h/2, -pole_r],
    [0 + wire_x, -bar_h/2, -wire_z],
    [0, -wire_y * bar_h + bar_h/2, pole_r],
    [0, -wire_y * bar_h + bar_h/2 , -pole_r],
    [wire_x, -bar_h/2, wire_z]
  ] ){
    points.push(new THREE.Vector3(pt[0], pt[1], pt[2]));
  }
  var wire_object = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({color: params.wire.color}));
  pole_object.add(wire_object);
  for ( var point of points )
    point.x = -point.x;
  var wire_object2 = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({color: params.wire.color}));
  pole_object_.add(wire_object2);

  floor = createBox(
    floor_x, floor_y, floor_z, 0, params.floor.color,
    0, -bar_h + floor_y, 0);

  pelvis = createEllipsoid(
    ...params.pelvis.size, params.pelvis.ratio, 0x0, 0, -1.2, 0);
  pelvis.setContactProcessingThreshold(-0.03);

  spine = createEllipsoid(
    ...params.spine.size, params.spine.ratio, 0x0,
    0, pelvis_r2 + spine_r2, 0, pelvis);
  // デフォルトのままだと腕に胸や腰がぶつかって背面の姿勢になれない
  spine.setContactProcessingThreshold(-0.03);

  chest = createEllipsoid(
    ...params.chest.size, params.chest.ratio, 0x0,
    0, chest_r2 + spine_r2, 0, spine);
  chest.setContactProcessingThreshold(-0.03);

  var texture = new THREE.TextureLoader().load('face.png');
  texture.offset.set(-0.25, 0);
  head = createEllipsoid(
    ...params.head.size, params.head.ratio, 0x0,
    0, head_r2 + chest_r2, 0, chest, texture);

  var left_upper_leg = createCylinder(
    ...params.upper_leg.size, params.upper_leg.ratio, 0x0,
    -upper_leg_x, -(pelvis_r2 + upper_leg_h/2), 0, pelvis);
  var right_upper_leg = createCylinder(
    ...params.upper_leg.size, params.upper_leg.ratio, 0x0,
    upper_leg_x, -(pelvis_r2 + upper_leg_h/2), 0, pelvis);
  upper_leg = [left_upper_leg, right_upper_leg];

  var left_lower_leg = createCylinder(
    ...params.lower_leg.size, params.lower_leg.ratio, 0x0,
    -lower_leg_x, -upper_leg_h/2 - lower_leg_h/2, 0, left_upper_leg);
  var right_lower_leg = createCylinder(
    ...params.lower_leg.size, params.lower_leg.ratio, 0x0,
    lower_leg_x, -upper_leg_h/2 - lower_leg_h/2, 0, right_upper_leg);
  lower_leg = [left_lower_leg, right_lower_leg];

  // 着地処理に使う見えない目印を足先に付ける。
  var mark_point = new THREE.Mesh(
    new THREE.SphereBufferGeometry(.1, 1, 1),
    new THREE.MeshPhongMaterial({colorWrite:false}));
  mark_point.position.set(0, -lower_leg_h/2, 0);
  ammo2Three.get(left_lower_leg).add(mark_point);
  left_lower_leg.mark_point = mark_point;
  mark_point = mark_point.clone();
  ammo2Three.get(right_lower_leg).add(mark_point);
  right_lower_leg.mark_point = mark_point;

  var left_upper_arm = createCylinder(
    ...params.upper_arm.size, params.upper_arm.ratio, 0x0,
    -chest_r1 - upper_arm_r, chest_r2 + upper_arm_h/2, 0, chest);
  var right_upper_arm = createCylinder(
    ...params.upper_arm.size, params.upper_arm.ratio, 0x0,
    chest_r1 + upper_arm_r, chest_r2 + upper_arm_h/2, 0, chest);
  if ( debug ) {
    ammo2Three.get(left_upper_arm).add(new THREE.AxesHelper(3));
    ammo2Three.get(right_upper_arm).add(new THREE.AxesHelper(3));
  }

  upper_arm = [left_upper_arm, right_upper_arm];

  var left_lower_arm = createCylinder(
    ...params.lower_arm.size, params.lower_arm.ratio, 0x0,
    0, upper_arm_h/2 + lower_arm_h/2, 0, left_upper_arm);
  var right_lower_arm = createCylinder(
    ...params.lower_arm.size, params.lower_arm.ratio, 0x0,
    0, upper_arm_h/2 + lower_arm_h/2, 0, right_upper_arm);
  lower_arm = [left_lower_arm, right_lower_arm];
  addHandToArm(left_lower_arm, lower_arm_h/2 + bar_r);
  addHandToArm(right_lower_arm, lower_arm_h/2 + bar_r);

  setColors();

  // 空気抵抗を受ける箇所
  air_res_parts = [pelvis, spine, chest, head];

  var x_axis = new Ammo.btVector3(1, 0, 0),
      y_axis = new Ammo.btVector3(0, 1, 0),
      axis;

  joint_belly = createConeTwist(
    pelvis, [0, pelvis_r2, 0], null,
    spine, [0, -spine_r2, 0], null,
    params.flexibility.belly);

  joint_breast = createConeTwist(
    spine, [0, spine_r2, 0], null,
    chest, [0, -chest_r2, 0], null,
    params.flexibility.breast);

  joint_neck = createConeTwist(
    chest, [0, chest_r2, 0], null,
    head, [0, -head_r2, 0], null,
    params.flexibility.neck);

  joint_belly.enableMotor(true);
  joint_breast.enableMotor(true);
  joint_neck.enableMotor(true);

  /* 骨盤の自由度は、膝を前に向けたまま脚を横に開く事は殆ど出来なくした。
     横に開く為には膝を横に向けないといけない。
     但し、完全に自由度を一つロックすると、不安定な動作を示す時があったので、
     一応少しだけ動くようにはした(技の動作では指定させない)。

     脚を横に開いて膝を曲げた時、足首を下に持っていく事は出来るが、
     足首を後には持っていけない。
     そういう姿勢になる鉄棒の技は多分無いので良い */
  var joint_left_hip = create6Dof(
    pelvis, [-upper_leg_x, -pelvis_r2, 0], [0, 0, 0],
    left_upper_leg, [0, upper_leg_h/2, 0], [0, 0, 0],
    [params.flexibility.hip.shift_min, params.flexibility.hip.shift_max,
     params.flexibility.hip.angle_min, params.flexibility.hip.angle_max]);
  var joint_right_hip = create6Dof(
    pelvis, [upper_leg_x, -pelvis_r2, 0], [0, 0, 0],
    right_upper_leg, [0, upper_leg_h/2, 0], [0, 0, 0],
    [params.flexibility.hip.shift_min, params.flexibility.hip.shift_max,
     params.flexibility.hip.angle_min, params.flexibility.hip.angle_max],
    'mirror');
  joint_hip = [joint_left_hip, joint_right_hip];

  // HingeConstraintを繋ぐ順番によって左右不均等になってしまう。
  // どうやって修正していいか分からないが、誰でも利き腕はあるので、
  // 当面気にしない。
  var joint_left_knee = createHinge(
    left_upper_leg, [upper_leg_x - lower_leg_x, -upper_leg_h/2, 0], null,
    left_lower_leg, [0, lower_leg_h/2, 0], null,
    params.flexibility.knee);
  var joint_right_knee = createHinge(
    right_upper_leg, [-upper_leg_x + lower_leg_x, -upper_leg_h/2, 0], null,
    right_lower_leg, [0, lower_leg_h/2, 0], null,
    params.flexibility.knee);
  joint_knee = [joint_left_knee, joint_right_knee];

  createShoulderJoint();

  axis = x_axis.rotate(y_axis, -120*degree); // dataに移さず、まだ直書き
  var joint_left_elbow = createHinge(
    left_upper_arm, [0, upper_arm_h/2, 0], axis,
    left_lower_arm, [0, -lower_arm_h/2, 0], axis,
    params.flexibility.elbow);
  axis = x_axis.rotate(y_axis, 120*degree); // dataに移さず、まだ直書き
  var joint_right_elbow = createHinge(
    right_upper_arm, [0, upper_arm_h/2, 0], axis,
    right_lower_arm, [0, -lower_arm_h/2, 0], axis,
    params.flexibility.elbow);
  joint_elbow = [joint_left_elbow, joint_right_elbow];

  var joint_left_grip = create6Dof(
    bar, [-chest_r1 - upper_arm_r, 0, 0], [Math.PI/2, 0, 0],
    left_lower_arm, [0, lower_arm_h/2 + bar_r, 0], null,
    [params.flexibility.grip.shift_min, params.flexibility.grip.shift_max,
     params.flexibility.grip.angle_min, params.flexibility.grip.angle_max]);
  joint_left_grip.gripping = true; // crete6Dof内でaddConstraintしてるので
  var joint_right_grip = create6Dof(
    bar, [chest_r1 + upper_arm_r, 0, 0], [Math.PI/2, 0, 0],
    right_lower_arm, [0, lower_arm_h/2 + bar_r, 0], null,
    [params.flexibility.grip.shift_min, params.flexibility.grip.shift_max,
     params.flexibility.grip.angle_min, params.flexibility.grip.angle_max]);
  joint_right_grip.gripping = true; // crete6Dof内でaddConstraintしてるので
  joint_grip = [joint_left_grip, joint_right_grip];

  // ツイスト、逆車移行して体の向きが変った時(スイッチスタンス)のグリップ。
  // 現在は右手が軸手で、右手は握る位置は同じだが、逆手にならないように、
  // スイッチスタンスになる時に右手も握り替えて順手にする。
  var joint_left_grip2 = create6Dof(
    bar, [3 * (chest_r1 + upper_arm_r), 0, 0], [-Math.PI/2, Math.PI, 0],
    left_lower_arm, [0, lower_arm_h/2 + bar_r, 0], null,
    [params.flexibility.grip.shift_min, params.flexibility.grip.shift_max,
     params.flexibility.grip.angle_min, params.flexibility.grip.angle_max]);
  physicsWorld.removeConstraint(joint_left_grip2);
  joint_left_grip2.gripping = false;
  var joint_right_grip2 = create6Dof(
    bar, [chest_r1 + upper_arm_r, 0, 0], [-Math.PI/2, Math.PI, 0],
    right_lower_arm, [0, lower_arm_h/2 + bar_r, 0], null,
    [params.flexibility.grip.shift_min, params.flexibility.grip.shift_max,
     params.flexibility.grip.angle_min, params.flexibility.grip.angle_max]);
  physicsWorld.removeConstraint(joint_right_grip2);
  joint_right_grip2.gripping = false;
  joint_grip_switchst = [joint_left_grip2, joint_right_grip2];

  hip_motors = [
    [joint_left_hip.getRotationalLimitMotor(0),
     joint_left_hip.getRotationalLimitMotor(1),
     joint_left_hip.getRotationalLimitMotor(2)],
    [joint_right_hip.getRotationalLimitMotor(0),
     joint_right_hip.getRotationalLimitMotor(1),
     joint_right_hip.getRotationalLimitMotor(2)]];

  grip_motors = [
    [joint_left_grip.getRotationalLimitMotor(0), // x軸回りは使わない
     joint_left_grip.getRotationalLimitMotor(1),
     joint_left_grip.getRotationalLimitMotor(2)],
    [joint_right_grip.getRotationalLimitMotor(0), // x軸回りは使わない
     joint_right_grip.getRotationalLimitMotor(1),
     joint_right_grip.getRotationalLimitMotor(2)]];
  grip_motors_switchst = [
    [joint_left_grip2.getRotationalLimitMotor(0),
     joint_left_grip2.getRotationalLimitMotor(1),
     joint_left_grip2.getRotationalLimitMotor(2)],
    [joint_right_grip2.getRotationalLimitMotor(0),
     joint_right_grip2.getRotationalLimitMotor(1),
     joint_right_grip2.getRotationalLimitMotor(2)]];

  var p = ammo2Three.get(pelvis).position;
  var transform = new Ammo.btTransform();
  transform.setIdentity();
  transform.setOrigin(new Ammo.btVector3(-p.x, -p.y, -p.z));
  transform.getBasis().setEulerZYX(...[0, -Math.PI/2, 0]);
  // Generic6DofSpringConstraintに繋いだ barに繋ぐと何故かモーターが効かない
  helper_joint = new Ammo.btHingeConstraint(pelvis, transform, true);
  helper_joint.setMaxMotorImpulse(params.helper_impulse);
  helper_joint.enableMotor(true);

  transform.setIdentity();
  bar_spring =
      new Ammo.btGeneric6DofSpringConstraint(bar, transform, true);
  bar_spring.setAngularLowerLimit(new Ammo.btVector3(0, 0, 0));
  bar_spring.setAngularUpperLimit(new Ammo.btVector3(0, 0, 0));
  bar_spring.enableSpring(1, true);
  bar_spring.enableSpring(2, true);
  physicsWorld.addConstraint(bar_spring);

  /* 各関節の力を設定。
     GUIで調整できる力は、setAdjustableForces()の中で定める。
     腰の関節は、初期状態に持っていく時にいじるので、状態遷移の時に定める */
  setAdjustableForces();
}

function createEllipsoid(
  rx, ry, rz, mass_ratio, color, px, py, pz, parent, texture)
{
  var geom = new THREE.SphereBufferGeometry(1, 8, 8).scale(rx, ry, rz);
  var attr = texture ?
      {color: color, transparent: true, map: texture}: {color: color};
  var object = new THREE.Mesh(geom, new THREE.MeshPhongMaterial(attr));
  var shape = makeConvexShape(geom);
  if ( texture ) {
    object.add(new THREE.Mesh(
      geom.clone().scale(0.99, 0.99, 0.99),
      new THREE.MeshPhongMaterial({color: color})));
  }
  if ( parent ) {
    let center = ammo2Three.get(parent).position;
    px += center.x; py += center.y; pz += center.z;
  }
  object.position.set(px, py, pz);
  return createRigidBody(object, shape, params.total_weight * mass_ratio);
}

function createCylinder(r, len, mass_ratio, color, px, py, pz, parent)
{
  var geom = new THREE.CylinderBufferGeometry(r, r, len, 10, 1);
  var object = new THREE.Mesh(
    geom, new THREE.MeshPhongMaterial({color: color}));
  var shape = new Ammo.btCylinderShape(new Ammo.btVector3(r, len/2, r));
  if ( parent ) {
    let center = ammo2Three.get(parent).position;
    px += center.x; py += center.y; pz += center.z;
  }
  object.position.set(px, py, pz);
  return createRigidBody(object, shape, params.total_weight * mass_ratio);
}

function createBox(r1, r2, r3, mass_ratio, color, px, py, pz, parent)
{
  var geom = new THREE.BoxBufferGeometry(r1*2, r2*2, r3*2, 1, 1, 1);
  var object = new THREE.Mesh(
    geom, new THREE.MeshPhongMaterial({color: color}));
  var shape = new Ammo.btBoxShape(new Ammo.btVector3(r1, r2, r3));
  if ( parent ) {
    let center = ammo2Three.get(parent).position;
    px += center.x; py += center.y; pz += center.z;
  }
  object.position.set(px, py, pz);
  return createRigidBody(object, shape, params.total_weight * mass_ratio);
}

function createRigidBody(object, physicsShape, mass, pos, quat, vel, angVel) {
  if ( pos ) {
    object.position.copy(pos);
  } else {
    pos = object.position;
  }

  if ( quat ) {
    object.quaternion.copy(quat);
  } else {
    quat = object.quaternion;
  }

  var transform = new Ammo.btTransform();
  transform.setIdentity();
  transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z));
  transform.setRotation(new Ammo.btQuaternion(quat.x, quat.y, quat.z, quat.w));
  var motionState = new Ammo.btDefaultMotionState(transform);

  var localInertia = new Ammo.btVector3(0, 0, 0);
  physicsShape.calculateLocalInertia(mass, localInertia);

  var rbInfo = new Ammo.btRigidBodyConstructionInfo(
    mass, motionState, physicsShape, localInertia);
  var body = new Ammo.btRigidBody(rbInfo);
  body.mass = mass; // 行儀悪いけど気にしない。

  body.setFriction(0.5);

  if ( vel ) {
    body.setLinearVelocity(new Ammo.btVector3(...vel));
  }

  if ( angVel ) {
    body.setAngularVelocity(new Ammo.btVector3(...angVel));
  }

  object.userData.physicsBody = body;
  object.userData.collided = false;
  ammo2Three.set(body, object);
  ammo2Initial.set(body, transform);

  scene.add(object);

  if ( mass > 0 ) {
    rigidBodies.push(object);

    // Disable deactivation
    body.setActivationState(4);
  }

  physicsWorld.addRigidBody(body);

  return body;
}

/* limit: [liner_lower, linear_upper, angular_lower, angular_upper]
   angular_{lower/upper} limit = x, z: -180 .. 180, y: -90 .. 90

   mirror != null の時は、angular_limitに対して、左右反転する。
   (linear_limitに対しても反転しないといかんかも知れないが、
    今は使ってない(常に[0,0,0])ので気にしてない。)

   last_arg = null の時は、従来の btGeneric6DofConstraintを作り、
   それ以外の時は、last_argの Euler角順序を使った btGeneric6DofSpring2Constraint
   を作る。

   - free means upper < lower
   - locked means upper == lower
   - limited means upper > lower

   角度の回転方向が -x, -y, -z 軸方向に対しているように思われる。
   これは、btGeneric6DofConstraint, btGeneric6DofSpring2Constraint 共通。
   ↑
   この理由分った。objA, objBを繋いだモーターに対する、Aから見た回転は、
   Bを回転させるのではなく、Aを回転させると考えているのだと思う。

   btGeneric6DofSpring2Constraint では、last_argで指定する Euler角順序の
   真ん中の軸(例えば、last_arg = Ammo.RO_XZY なら Z軸)の範囲が ±90°、
   それ以外の軸の範囲が ±180°に決められている。

   btGeneric6DofConstraintの場合は、
   モーターで指定する角度は、zyxのEuler角以外は使えない。
   つまり、最初に z軸(体の正面軸)で回し、次にy軸(捻りの軸)で回し、
   最後に x軸(宙返りの軸)で回す。但し、最初に z軸で回してしまうと、
   x軸, y軸も向きが変ってしまうので、中々思った角度に調整出来なくなる。
   姿勢によっては不可能になるが、z軸回りの回転は lockしてしまった方が
   分かり易い */
function create6Dof(
  objA, posA, eulerA = null, objB, posB, eulerB = null, limit, mirror = null,
  last_arg = null)
{
  var transform1 = new Ammo.btTransform(),
      transform2 = new Ammo.btTransform();
  if ( !eulerA ) eulerA = [0, 0, 0];
  if ( !eulerB ) eulerB = [0, 0, 0];
  transform1.setIdentity();
  transform1.getBasis().setEulerZYX(...eulerA);
  transform1.setOrigin(new Ammo.btVector3(...posA));
  transform2.setIdentity();
  transform2.getBasis().setEulerZYX(...eulerB);
  transform2.setOrigin(new Ammo.btVector3(...posB));
  var joint, constr, last_arg;
  if ( last_arg !== null ) {
    constr = Ammo.btGeneric6DofSpring2Constraint;
  } else {
    constr = Ammo.btGeneric6DofConstraint;
    last_arg = true;
  }
  if ( objB !== null )
    joint = new constr(objA, objB, transform1, transform2, last_arg);
  else
    joint = new constr(objA, transform1, last_arg);
  joint.setLinearLowerLimit(new Ammo.btVector3(...limit[0]));
  joint.setLinearUpperLimit(new Ammo.btVector3(...limit[1]));
  if ( mirror != null ) {
    var tmp = [...limit[3]];
    limit[3][1] = -limit[2][1];
    limit[3][2] = -limit[2][2];
    limit[2][1] = -tmp[1];
    limit[2][2] = -tmp[2];
  }
  joint.setAngularLowerLimit(new Ammo.btVector3(...degrees(limit[2])));
  joint.setAngularUpperLimit(new Ammo.btVector3(...degrees(limit[3])));

  physicsWorld.addConstraint(joint, true);
  return joint;
}

function createConeTwist(
  objA, posA, eulerA = null, objB, posB, eulerB = null, limit = null)
{
  /* ConeTwistConstraint.setLimit(3,θx), setLimit(4,θy), setLimit(5,θz)

     θx, θy, θz: radianでなくdegreeで指定。

     constr.local な座標系の 原点からx軸方向、-x軸方向に向いた Cone
     (Coneの広がりは、y軸回りに±θy, z軸回りに±θz)、
     の内側にスイング動作を制限する。
     ツイストの自由度は、x軸回りに±θx (確認してないので、もしかすると
     [0..+θx]かも知れないが、きっと違う)

     setLimit(3,θx)を省くと、どうも上手く機能しない。
  */
  var transform1 = new Ammo.btTransform(),
      transform2 = new Ammo.btTransform();
  if ( !eulerA ) eulerA = [0, 0, Math.PI/2];
  if ( !eulerB ) eulerB = [0, 0, Math.PI/2];
  transform1.setIdentity();
  transform1.getBasis().setEulerZYX(...eulerA);
  transform1.setOrigin(new Ammo.btVector3(...posA));
  transform2.setIdentity();
  transform2.getBasis().setEulerZYX(...eulerB);
  transform2.setOrigin(new Ammo.btVector3(...posB));
  var joint = new Ammo.btConeTwistConstraint(
    objA, objB, transform1, transform2);
  if ( limit ) {
    limit = degrees(limit);
    // 3: twist x-axis, 4: swing y-axis, 5: swing z-axis: constraint local
    joint.setLimit(3, limit[0]);
    joint.setLimit(4, limit[1]);
    joint.setLimit(5, limit[2]);
  }

  physicsWorld.addConstraint(joint, true);
  return joint;
}

function createHinge(
  objA, pivotA, axisA = null, objB, pivotB, axisB = null, limit = null)
{
  const x_axis = new Ammo.btVector3(1, 0, 0);
  if ( !axisA ) axisA = x_axis;
  if ( !axisB ) axisB = x_axis;
  var joint = new Ammo.btHingeConstraint(
    objA, objB,
    new Ammo.btVector3(...pivotA), new Ammo.btVector3(...pivotB),
    axisA, axisB, true);
  if ( limit )
    joint.setLimit(...degrees([-limit[1], -limit[0]]), 0.9, 0.3, 1);

  physicsWorld.addConstraint(joint, true);
  return joint;
}

function addHandToArm(arm, y) {
  var arm_obj = ammo2Three.get(arm);
  var geom = new THREE.SphereBufferGeometry(params.hand.size, 5, 5);
  var hand = new THREE.Mesh(
    geom, new THREE.MeshPhongMaterial({color: params.hand.color}));
  hand.position.set(0, y, 0);
  arm_obj.add(hand);
  arm_obj.hand = hand;
}

function makeConvexShape(geom) {
  var shape = new Ammo.btConvexHullShape();
  var index = geom.getIndex();
  var pts = geom.getAttribute('position');
  for ( var i = 0; i < index.count; ++i )
    shape.addPoint(new Ammo.btVector3(pts.getX(i), pts.getY(i), pts.getZ(i)));

  return shape;
}

function setHipMaxMotorForce(max, limitmax) {
  for ( var leftright = L; leftright <= R; ++leftright ) {
    for ( var xyz = 0; xyz < 3; ++xyz ) {
      var motor = hip_motors[leftright][xyz];
      motor.m_maxMotorForce = max;
      motor.m_maxLimitForce = limitmax;
      motor.m_enableMotor = true;
    }
  }
}

/* target_angles (degree): [[left_xyz], [right_xyz]],
   dts: [[left_xyz], [right_xyz]]
   柔軟性を越えた角度指定をしても、その角度に向かう強い力を使うようになっている。
   力の指定方法は本来 dts の方を使うべきなので、良くない。 */
function controlHipMotors(target_angles, dts) {
  for ( var leftright = L; leftright <= R; ++leftright ) {
    for ( var xyz = 0; xyz < 3; ++xyz ) {
      var motor = hip_motors[leftright][xyz],
          target_angle = target_angles[leftright][xyz] * degree,
          dt = dts[leftright][xyz],
          angle = joint_hip[leftright].getAngle(xyz);
      /* 毎フレーム呼び出すので、dt は変える必要があるが、
         敢えて変えないようにしてみる */
      motor.m_targetVelocity = (target_angle - angle) / dt;
    }
  }
}

function getShoulderAngle(lr) {
  /* 体操的な意味での肩角度(つまりx軸周りの角度)を返す */
  return hinge_shoulder[lr]
    ? joint_shoulder[lr].getHingeAngle()
    : -joint_shoulder6dof[lr].getAngle(0);
}

function fixEuler(angles) {
  /* Bulletの joint.getAngle()から得られる Euler角は、腕から見た肩の回転に対応するので
     q_cur_m 0,1,2列は、腕からみたそれぞれモーターの回転x,y,z軸の成分になっている。*/
  var q_cur_m = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(angles[0], angles[1], angles[2], 'XZY'));

  /* 転置して、q_cur_m の 0,1,2列は、胸からみたそれぞれモーターの回転x,y,z軸の成分。*/
  q_cur_m.getInverse(q_cur_m);

  /* Bulletの Euler角(XZY order)では Z <= pi/2 で、z > pi/2 になろうとすると、
     x,yをpi回して z < pi/2に収める。この x,yの不連続性の為に不安定になるため、
     Blenderのオイラー角の実装
       https://developer.blender.org/diffusion/B/browse/master/source/blender/blenlib/intern/math_rotation.c
     を使って、zの範囲も -pi <= z <= pi に入れるようにする。

     Blender のオイラー角は、extrinsic order。
     又、Blenderのコードでは、回転行列が転置された定義を利用しているので、
     もう一度 q_cur_mを転置。結局最初のq_cur_mを使えば良いのだが、
     やっている事を明確にするために、転置したあと、また転置する。*/
  q_cur_m.getInverse(q_cur_m);

  // q_cur_m_{row, col} = q_cur_m.elements[row + col*4]  (row, col = 0,1,2)
  var e = q_cur_m.elements,
      mat = [];
  for ( var row = 0; row < 3; ++row )
    mat.push([e[row], e[row + 4], e[row + 8]])

  // eul1 が Bullet の euler, eul1 と eul2で良い方を選ぶのが Blender の euler.
  var eul1 = [0,0,0], eul2 = [0,0,0];

  /* XZY order に固定。(Blender の YZX order) */
  const i = 1, j = 2, k = 0;
  var cy = Math.hypot(mat[i][i], mat[i][j]);
  if ( cy > 0.0000001 ) {
    eul1[i] = Math.atan2(mat[j][k], mat[k][k]);
	eul1[j] = Math.atan2(-mat[i][k], cy);
	eul1[k] = Math.atan2(mat[i][j], mat[i][i]);

	eul2[i] = Math.atan2(-mat[j][k], -mat[k][k]);
	eul2[j] = Math.atan2(-mat[i][k], -cy);
	eul2[k] = Math.atan2(-mat[i][j], -mat[i][i]);
  } else {
	eul1[i] = eul2[i] = Math.atan2(-mat[k][j], mat[j][j]);
	eul1[j] = eul2[j] = Math.atan2(-mat[i][k], cy);
	eul1[k] = eul2[k] = 0;
  }

  if ( Math.abs(eul1[0]) + Math.abs(eul1[1]) + Math.abs(eul1[2]) >
       Math.abs(eul2[0]) + Math.abs(eul2[1]) + Math.abs(eul2[2]) )
    eul1 = eul2;

  for ( var xyz = 0; xyz < 3; ++xyz )
    angles[xyz] = eul1[xyz];
}

function controlHingeShoulderMotors(leftright, targ_ang, dt) {
  /* btHingeConstraint.setMotorTarget() は、内部で getHingeAngle()
     を呼び出していて、getHingeAngle()は、角度計算に arctanを使っている。
     このせいで、素のままでは肩角度の範囲が、-pi .. pi に収まっていないと動作が
     おかしくなる。

     setMotorTarget() に相当する計算を自前で行い、
     肩の目標角度の範囲を2pi以上に出来るようにする */

  var cur_ang,
      cur_ang_extended, // shoulder_winding を考慮して範囲を広げた角度
      shoulder_impulse = gui_params['肩の力'];

  cur_ang = getShoulderAngle(leftright);

  /* アドラーのような大きな肩角度のための特別処理。
     現在は Hingeの場合しか対応してない。確認してないが6Dofでは絶対おかしくなる。 */
  if ( cur_ang - last_shoulder_angle[leftright] < -Math.PI * 1.5 ) {
    // pi-d → pi+d' になろうとして境界を超えて -pi-d'に飛び移った
    ++shoulder_winding[leftright];
  } else if ( cur_ang - last_shoulder_angle[leftright] > Math.PI * 1.5 ) {
    // -pi+d → -pi-d' になろうとして境界を超えて pi-d'に飛び移った
    --shoulder_winding[leftright];
  }
  last_shoulder_angle[leftright] = cur_ang;
  cur_ang_extended = cur_ang + shoulder_winding[leftright] * 2 * Math.PI;

  var target_angvel = (targ_ang - cur_ang_extended) / dt;
  joint_shoulder[leftright].enableAngularMotor(
    true, target_angvel, shoulder_impulse);
}

function control6DofShoulderMotors(leftright, e) {
  /* 6Dofの関節の制御、かなり手こずった。腰の関節やグリップにも6Dofを使っているが、
     ここで行っている処理をやってないので、バグってるのかも知れない。

     Bulletの問題もあり色々制限がある。
     アドラーのような肩角度の指定は出来ない。
     肩を横に開く角度(z軸)は 89度までしか指定出来ない。*/

  var joint = joint_shoulder6dof[leftright],
      joint_ang = [0, 1, 2].map(i => joint.getAngle(i)),
      targ_ang = [0, 0, 0], // Euler角(XZY順序)
      rot_ang = [0, 0, 0],
      dt = [0.1, 0.1, 0.1]; // targ_angに持っていく時間。

  /* joint.getAngle() が返してくるオイラー角は、胸から見た腕の回転ではなく、
     腕から見た胸の回転になっている。これにずっと気づかず単に符号が反転してるだけ、
     と思っていた。これを胸から見た腕の回転に読み直すと同時に、
     オイラー角を扱い易いように修正する。*/
  fixEuler(joint_ang);

  targ_ang[0] = -e[0] * degree;
  targ_ang[2] = (leftright == L ? +1 : -1) * e[1]*degree;
  // 腕を捻る力は、腕を絞る力が正、開く力が負。
  targ_ang[1] = (leftright == L ? -1 : +1) * e[2]*degree;
  rot_ang = [0,1,2].map(i => -(targ_ang[i] - joint_ang[i]));
  dt = [e[3], e[5], e[4]];

  for ( var xyz = 0; xyz < 3; ++xyz ) {
    joint.getRotationalLimitMotor(xyz).m_targetVelocity
      = rot_ang[xyz] / dt[xyz];
  }

  if ( debug ) {
    var q_cur_v = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(joint_ang[0], joint_ang[1], joint_ang[2], 'XZY'));
    var e = [[1,0,0],[0,1,0],[0,0,1]];
    for ( var xyz = 0; xyz < 3; ++xyz ) {
      if ( Math.abs(rot_ang[xyz]) < 0.1 ) {
        av[xyz].visible = false;
        continue;
      }
      av[xyz].visible = true;
      var v = new THREE.Vector3(...e[xyz]).applyQuaternion(q_cur_v);
      av[xyz].setDirection(v.multiplyScalar(-Math.sign(rot_ang[xyz])));
      av[xyz].position.y = 0.5;
      av[xyz].setLength(1.5*Math.abs(rot_ang[xyz]), 0.1, 0.1);
    }
    if ( DebugLog.check() )
      console.log(`
joint_ang: ${[joint_ang[0]/degree, joint_ang[1]/degree, joint_ang[2]/degree]}
targ: ${[targ_ang[0]/degree, targ_ang[1]/degree, targ_ang[2]/degree]}
rot: ${[-rot_ang[0]/degree, -rot_ang[1]/degree, -rot_ang[2]/degree]}`);
  }
}

function controlShoulderMotors(leftright) {
  var e = curr_dousa.shoulder[leftright],
      is_hinge = e.length == 2;

  setCurJointShoulder(leftright, is_hinge);
  if ( is_hinge ) { // 肩角度の指定のみ。
    controlHingeShoulderMotors(leftright, -e[0] * degree, e[1]);
  } else {
    control6DofShoulderMotors(leftright, e);
  }
}

function setGripMaxMotorForce(max, limitmax) {
  // x軸回りの回転は制御しない。但し、バーとの摩擦を導入したら使う時があるかも
  for ( var leftright = L; leftright <= R; ++leftright ) {
    for ( var yz = 1; yz < 3; ++yz ) {
      var motor = grip_motors[leftright][yz],
          motor2 = grip_motors_switchst[leftright][yz];
      motor.m_maxMotorForce = motor2.m_maxMotorForce = max;
      motor.m_maxLimitForce = motor2.m_maxLimitForce = limitmax;
      motor.m_enableMotor = motor2.m_enableMotor = true;
    }
  }
}

/* grip_elem[] = [left_elem, right_elem]
     left_elem, right_elem:
       'release' -- バーから手を離す。
       'catch' -- バーを掴もうとする(失敗する事もある)。
       'CATCH' -- バーを掴む(失敗しない)。リプレイ用。
       [y_angle, z_angle, dt_y, dt_z] --
            目標の角度(degree)とそこに持ってくのに掛ける時間 */
function controlGripMotors(grip_elem) {
  var elapsed = dousa_clock.getElapsedTime(),
      vects = [0,1].map(leftright => new THREE.Vector3()),
      arms = [0,1].map(leftright => ammo2Three.get(lower_arm[leftright])),
      curr_joint_grip = !is_switchst ? joint_grip : joint_grip_switchst,
      curr_grip_motors = !is_switchst ? grip_motors : grip_motors_switchst;

  function canCatch(leftright) {
    /* ある程度、手とバーが近くないとバーをキャッチ出来ないようにする。
       キャッチする時に勢いが付き過ぎてると弾かれるようにもしたいが、
       それはやってない。

       キャッチ出来るかどうかの基準は、手とバーとの距離ではなく、
       下腕の真ん中とバーとの距離によって行う。
       これによって、手の先よりバーが遠くにあると絶対掴めないが、
       肘側にバーがあれば肘を曲げて掴む事が出来る、というのを擬似的に反映する。 */
    var dist = vects[leftright].y ** 2 + vects[leftright].z ** 2;
    return (dist < (gui_params['キャッチ幅'] * 0.01) ** 2 &&
            elapsed < gui_params['キャッチ時間']);
  }

  function resetWinding(lr) {
    shoulder_winding[lr] = 0;
    last_shoulder_angle[lr] = getShoulderAngle(lr);

    /* windingをリセットする時に、アドラーの後に離手した時など、
       肩角度の目標角が背面(360度ぐらい)になったままだと
       腕を一回転させようとしてしまう。
       その場凌ぎ的で嫌だが、ここで修正する */
    // 複製しないと本来の動作設定自体を上書きしてまう。嫌
    curr_dousa.shoulder =
      [[].concat(curr_dousa.shoulder[L]),
       [].concat(curr_dousa.shoulder[R])];
    if ( curr_dousa.shoulder[lr][0] > 180 )
      curr_dousa.shoulder[lr][0] -= 360;
    if ( curr_dousa.shoulder[lr][0] < -180 )
      curr_dousa.shoulder[lr][0] += 360;
  }

  function catchBar(leftright, is_catch) {
    var start = leftright == LR ? L : leftright,
        end = leftright == LR ? R : leftright;

    for ( var lr = start; lr <= end; ++lr ) {
      if ( is_catch ) {
        resetWinding(lr);
        physicsWorld.addConstraint(curr_joint_grip[lr]);
        if ( state.main == 'run' ) {
          var last_dousa = replayInfo.records[replayInfo.lastDousaPos].dousa,
              grip_copy = [].concat(last_dousa.grip);
          grip_copy[lr] = 'CATCH'; // リプレイの時に必ず成功させるようにする
          last_dousa.grip = grip_copy;
        }
      } else {
        physicsWorld.removeConstraint(curr_joint_grip[lr]);
        resetWinding(lr);
      }
      curr_joint_grip[lr].gripping = is_catch;
    }
  }

  function setForce(leftritht) {
    if ( grip_elem[leftritht] == 'catch' || grip_elem[leftritht] == 'CATCH') {
      // すでに掴んでいる手を、更に掴もうとするのは意味なし
      return;
    }

    for ( var yz = 1; yz < 3; ++yz ) {
      var motor = curr_grip_motors[leftright][yz],
          target_angle = grip_elem[leftright][yz-1] * degree,
          dt = grip_elem[leftright][yz+1],
          angle = curr_joint_grip[leftright].getAngle(yz);
      motor.m_targetVelocity = (target_angle - angle) / dt;
    }
  }

  for ( var lr = L; lr <= R; ++lr )
    arms[lr].getWorldPosition(vects[lr]);
  var switching = vects[L].x > vects[R].x; // 左手の方が右手より右に有る

  if ( curr_joint_grip[L].gripping && curr_joint_grip[R].gripping ) {
    // 両手バーを掴んでいる
    for ( var leftright = L; leftright <= R; ++leftright ) {
      if ( grip_elem[leftright] == 'release' ) {
        // 離手
        catchBar(leftright, false);
      } else {
        setForce(leftright);
      }
    }
  } else if ( curr_joint_grip[L].gripping && !curr_joint_grip[R].gripping ) {
    // 左手のみバーを掴んでいる
    if ( grip_elem[L] == 'release' ) {
      // 左手も離手。grip_elem[R]は無視。
      // つまり、その瞬間反対の手を掴むとかは出来ない
      catchBar(L, false);
    } else if ( grip_elem[R] == 'catch' || grip_elem[R] == 'CATCH' ) {
      // 右手でバーを掴もうとする。
      // スタンスは変わらないものとする(左軸手のツイストは現在は対応してない)。
      if ( grip_elem[R] == 'CATCH' || canCatch(R) )
        catchBar(R, true);

      setForce(L);
    }
  } else if ( !curr_joint_grip[L].gripping && curr_joint_grip[R].gripping ) {
    // 右手のみバーを掴んでいる
    if ( grip_elem[R] == 'release' ) {
      // 右手も離手。grip_elem[0]は無視。
      // つまり、その瞬間反対の手を掴むとかは出来ない
      catchBar(R, false);
    } else if ( grip_elem[L] == 'catch' || grip_elem[L] == 'CATCH' ) {
      // 左手でバーを掴もうとする。
      // スタンスが変わる場合(ツイスト、移行)と変わらない場合がある。
      if ( grip_elem[L] == 'CATCH' || canCatch(L) ) {
        if ( switching != is_switchst ) {
          // スタンス変更。実際の技とは大違いだが、右手も持ち替えて順手にする
          catchBar(LR, false);
          is_switchst = switching;
          curr_joint_grip = !is_switchst ? joint_grip : joint_grip_switchst;
          curr_grip_motors = !is_switchst ? grip_motors : grip_motors_switchst;
          catchBar(LR, true);
        } else {
          catchBar(L, true);
        }
      }

      setForce(R);
    }
  } else if ( !curr_joint_grip[L].gripping && !curr_joint_grip[R].gripping ) {
    // 両手離している。
    if ( switching != is_switchst ) { // 離れ技で捻った
      is_switchst = switching;
      curr_joint_grip = !is_switchst ? joint_grip : joint_grip_switchst;
      curr_grip_motors = !is_switchst ? grip_motors : grip_motors_switchst;
    }

    for ( var leftright = L; leftright <= R; ++leftright ) {
      // 離していた手を掴もうとする
      if ( grip_elem[leftright] == 'CATCH' ||
           grip_elem[leftright] == 'catch' && canCatch(leftright) )
        catchBar(leftright, true);
    }
  }
}

function controlBody() {
  if ( state.main == 'init' )
    helper_joint.setMotorTarget(helper_joint.start_angle, 0.2);

  var q = new Ammo.btQuaternion(), e;

  for ( var leftright = L; leftright <= R; ++leftright ) {
    e = curr_dousa.knee;
    joint_knee[leftright].setMotorTarget(
      -e[leftright][0]*degree, e[leftright][1]);

    e = curr_dousa.elbow;
    joint_elbow[leftright].setMotorTarget(
      -e[leftright][0]*degree, e[leftright][1]);

    controlShoulderMotors(leftright);
  }

  e = curr_dousa.hip;
  controlHipMotors( // z軸回りのオイラー角は0で固定
    [[-e[0][0], -e[0][1], 0],
     [-e[1][0],  e[1][1], 0]],
    [[e[0][2], e[0][3], 0.2],
     [e[1][2], e[1][3], 0.2]]);

  e = curr_dousa.neck;
  q.setEulerZYX(e[0]*degree, e[1]*degree, e[2]*degree);
  joint_neck.setMotorTarget(q);

  e = curr_dousa.breast;
  q.setEulerZYX(e[0]*degree, e[1]*degree, e[2]*degree);
  joint_breast.setMotorTarget(q);

  e = curr_dousa.belly;
  q.setEulerZYX(e[0]*degree, e[1]*degree, e[2]*degree);
  joint_belly.setMotorTarget(q);

  /* x軸回りは制御しない。
     y軸正方向回り: grip側の手を軸手にして、外側に体を開く。
     z軸正方向回り: 鉄棒に対して、grip側の肩を近づけて反対側の肩を遠ざける */
  controlGripMotors(curr_dousa.grip);
}

function onWindowResize() {
  var container = document.getElementById('container');
  camera.aspect = container.offsetWidth / container.offsetHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.offsetWidth, container.offsetHeight);
}

function animate() {
  if ( state.main == 'reset' ) {
    doResetMain();
    return;
  } else if ( state.main == 'settings' ) {
    return;
  }

  requestAnimationFrame(animate);

  var deltaTime = clock.getDelta();
  switch ( state.main ) {
  case 'run':
    renderRun(deltaTime);
    break;
  case 'replay':
    renderReplay(deltaTime);
    break;
  default:
    updatePhysics(deltaTime);
  }

  control.update();
  drawBar(); // バーをしなったように見せる

  renderer.render(scene, camera);
}

function drawBar() {
  var v = new THREE.Vector3();
  ammo2Three.get(bar).getWorldPosition(v);
  bar_curve.points[1].y = bar_curve.points[2].y = v.y;
  bar_curve.points[1].z = bar_curve.points[2].z = v.z;
  if ( bar_mesh != null )
    scene.remove(bar_mesh);
  // 毎フレームで作り直していて無駄だが、それ以外の方法は分からなかった。
  bar_mesh = new THREE.Mesh(
    new THREE.TubeGeometry(bar_curve, 8, params.bar.size[0], 4, false),
    new THREE.MeshPhongMaterial({color: params.bar.color}));
  scene.add(bar_mesh);
}

function renderRun(deltaTime) {
  addDetailsRecord(deltaTime);
  updatePhysics(deltaTime);
}

function renderReplay(deltaTime) {
  deltaTime += replayInfo.remainingDelta;
  while ( replayInfo.replayPos < replayInfo.records.length &&
          replayInfo.records[replayInfo.replayPos].delta <= deltaTime )
  {
    var record = replayInfo.records[replayInfo.replayPos],
        parts = [pelvis, lower_leg[L], lower_leg[R]],
        elem, p, q, vel, ang;

    deltaTime -= record.delta;

    if ( record.active_key != null ) {
      var key = (record.active_key & 0xff) == 32 ? 'space' : 'enter';
      document.querySelector('button#' + key).classList.toggle(
        'active', (record.active_key & 0x100) == 0); // 駄目実装
    }

    if ( record.dousa != null ) {
      for ( var x in record.dousa ) {
        curr_dousa[x] = record.dousa[x];
        state.entry_num = record.entry_num;
        state.waza_pos = record.waza_pos;
        showActiveWaza();
      }
    }

    /* キー入力の間隔が短い時に、details = null, delta = 0になる */
    if ( record.details != null ) {
      for ( var i in parts ) { // for ... of でなく for ... in
        elem = parts[i];
        [p, q, vel, ang] = record.details[i];
        transformAux1.setIdentity();
        transformAux1.setOrigin(new Ammo.btVector3(...p));
        transformAux1.setRotation(new Ammo.btQuaternion(...q));
        elem.setWorldTransform(transformAux1);
        elem.setLinearVelocity(new Ammo.btVector3(...vel));
        elem.setAngularVelocity(new Ammo.btVector3(...ang));
      }
    }

    if ( record.delta > 0 )
      updatePhysics(record.delta);

    ++replayInfo.replayPos;
  }

  replayInfo.remainingDelta = deltaTime;
}

function updatePhysics(deltaTime) {
  DebugLog.countUp();

  var p, q;
  controlBody();
  checkLanding();
  if ( state.landing == -1 )
    applyLandingForce();
  physicsWorld.stepSimulation(
    deltaTime * gui_params['時間の流れ'], 480, 1. / params.fps);

  // Update rigid bodies
  for ( var i = 0, il = rigidBodies.length; i < il; i ++ ) {
    var objThree = rigidBodies[i];
    var objPhys = objThree.userData.physicsBody;
    var ms = objPhys.getMotionState();

    if ( ms ) {
      ms.getWorldTransform(transformAux1);
      p = transformAux1.getOrigin();
      q = transformAux1.getRotation();
      objThree.position.set(p.x(), p.y(), p.z());
      objThree.quaternion.set(q.x(), q.y(), q.z(), q.w());

      objThree.userData.collided = false;
    }
  }
}
function checkLanding() {
  /* バーを握ってる時はチェックしない。
     動作要素で、未使用の "landing" になった時しかチェックしない、という手もある。 */
  if ( joint_grip[L].gripping || joint_grip[R].gripping ||
       joint_grip_switchst[L].gripping || joint_grip_switchst[R].gripping ||
       state.landing < 0 )
    return;

  /* 参考:
     https://medium.com/@bluemagnificent/collision-detection-in-javascript-3d-physics-using-ammo-js-and-three-js-31a5569291ef
     上のリンクにはコールバックを使ったやり方も書かれているが、
     現在利用している自前の ammo.js には、
     btCollisionObjectWrapperインターフェイスが、getCollisionObject()を
     公開してないため使えない(と言うか全くの空っぽ)。

     ammo.js作り直すか、最新版のに置き直すのしんどいし、コールバック使っても
     大して分り易くならないみたいだったので、下の実装でいく。

     floorと足とが少しぐらい離れてても気にしない。*/
  var dispatcher = physicsWorld.getDispatcher();
  var numManifolds = dispatcher.getNumManifolds();
  var landing = 0;
  for ( var i = 0; i < numManifolds; ++i ) {
    const manifold = dispatcher.getManifoldByIndexInternal(i),
          num_contacts = manifold.getNumContacts();
    if ( num_contacts < 1 )
      continue;

    var rb0 = Ammo.castObject(manifold.getBody0(), Ammo.btRigidBody),
        rb1 = Ammo.castObject(manifold.getBody1(), Ammo.btRigidBody);
    if ( rb0 != floor && rb1 != floor )
      continue;
    if ( rb0 == floor )
      rb0 = rb1;

    if ( rb0 == lower_leg[L] || rb0 == lower_leg[R] ) {
      landing |= (rb0 == lower_leg[L]) ? 1 : 2;
    } else if ( rb0 != lower_arm[L] && rb0 != lower_arm[R] ) {
      // 下腕(手は許す)、下肢以外が地面に着いたら全部着地失敗とみなす。
      landing = -2;
      break;
    }
  }

  if ( landing == 3 ) {
    state.landing = -1;
    upsideDown();
  } else {
    state.landing = landing;
  }
}

function upsideDown(enable = true) {
  // 両足が地面に着いたら、着地点に足をひっつけて、反重力を掛ける事により、
  // 下から上にぶら下げる。
  // enable == false なら、逆に、この設定を取り消して通常に戻す。
  var joint;
  if ( enable ) {
    joint_landing = [];
    for ( var lr = L; lr <= R; ++lr ) {
      var leg = lower_leg[lr];
      joint = create6Dof( // x,z軸方向の回転は制限なし
        lower_leg[lr], [0, -params.lower_leg.size[1]/2 - 0.03, 0], null,
        null, [0,0,0], null,
        [[-0.01,-0.01,-0.01], [0.01,0.01,0.01], [10,-10,10], [-10,10,-10]]);
      joint_landing.push(joint);
    }

    physicsWorld.setGravity(new Ammo.btVector3(0, 9.8, 0));
  } else {
    while ( joint = joint_landing.pop() )
      physicsWorld.removeConstraint(joint);
    physicsWorld.setGravity(new Ammo.btVector3(0, -9.8, 0));
  }
}

function applyLandingForce() {
  /* 着地を誤魔化す為に、着地条件が整えば水の中にいるみたいに極端に空気抵抗を増やす。 */
  const landing_air_registance = +gui_params['着地空気抵抗'],
        enable_range = +gui_params['着地補助範囲'] * degree,
        y_axis = new THREE.Vector3(0, 1, 0);
  var p_vec, // 左右の足先の中間点
      com = getCOM(), // 重心
      lean_angle, // 重心の鉛直軸からのズレ
      sign, // 起き上がりつつある時 +, 倒れつつある時 -
      tmp = new THREE.Vector3(),
      f, vel, vel_len;
  p_vec = lower_leg[L].mark_point.getWorldPosition(tmp);
  p_vec.lerp(lower_leg[R].mark_point.getWorldPosition(tmp), 0.5);
  com.sub(p_vec); // 相対位置にする。
  lean_angle = Math.acos(com.dot(y_axis)/com.length());
  f = com.clone();
  f.cross(y_axis); // com, y_axis に垂直なベクトル
  f.cross(com); // com, y_axisの張る面内 comに垂直。重心に向かう方向。
  sign = Math.sign(
    spine.getLinearVelocity().dot(new Ammo.btVector3(...f.toArray())));

  if ( lean_angle > enable_range && sign < 0 ) {
    state.landing = -2;
    upsideDown(false);
    return;
  }

  var air_resistances = [];
  for ( var body of air_res_parts ) {
    vel = body.getLinearVelocity();
    vel_len = vel.length();

    // F = ( -v / |v| ) * (空気抵抗の係数 * |v|^2)
    f = new Ammo.btVector3(
      -vel.x() * vel_len * landing_air_registance,
      -vel.y() * vel_len * landing_air_registance,
      -vel.z() * vel_len * landing_air_registance);
    if ( f.length() > params.landing.air_max ) {
      /* f が大き過ぎると吹っ飛んでしまう */
      f.normalize();
      f.op_mul(params.landing.air_max);
    }
    air_resistances.push([f.x(), f.y(), f.z()]);
    body.applyCentralForce(f);
  }

  if ( debug ) {
    var body;
    if ( floor.arrows == null ) {
      floor.arrows = true;
      for ( body of air_res_parts ) {
        body.air_arrow = new THREE.ArrowHelper(
          new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,0));
      }
    }
    for ( body of air_res_parts )
      scene.add(body.air_arrow);

    for ( body of air_res_parts ) {
      f = new THREE.Vector3(...air_resistances.shift());
      setDebugArrow(body.air_arrow, ammo2Three.get(body).position, f);
    }
  }
}

/* 全身の重心(THREE.Vector3)を返す。*/
function getCOM() {
  var com = [0, 0, 0],
      num = rigidBodies.length-1;

  for ( var objThree of rigidBodies ) {
    var body = objThree.userData.physicsBody;
    if ( body == bar )
      continue;

    var p = body.getCenterOfMassPosition();
    com[0] += p.x() / num;
    com[1] += p.y() / num;
    com[2] += p.z() / num;
  }

  return new THREE.Vector3(...com);
}

function setDebugArrow(arrow, pos, vec) {
  var v = vec.clone(),
      len = v.length() / 2;
  v.normalize();
  arrow.setDirection(v);
  arrow.setLength(len);
  arrow.position.copy(pos);
}

function enableHelper(enable) {
  if ( enable ) {
    // barの位置を原点に固定しないと、helperに押されてbarが上下してしまう。
    // 開始姿勢を"静止"にすると、バーが上に押し上げられるのでよく分かる。
    bar_spring.setLinearLowerLimit(new Ammo.btVector3(0, 0, 0));
    bar_spring.setLinearUpperLimit(new Ammo.btVector3(0, 0, 0));
    physicsWorld.addConstraint(helper_joint);
  } else {
    // しなりの可動域 2m(実質制限無し)にする。
    bar_spring.setLinearLowerLimit(new Ammo.btVector3(0, -2, -2));
    bar_spring.setLinearUpperLimit(new Ammo.btVector3(0, 2, 2));
    physicsWorld.removeConstraint(helper_joint);
  }
}

function setCurJointShoulder(lr, is_hinge) {
  hinge_shoulder[lr] = is_hinge;
  joint_shoulder[lr].setEnabled(is_hinge);
  for ( var i = 0; i < 3; ++i )
    joint_shoulder6dof[lr].getRotationalLimitMotor(i)
    .m_enableMotor = !is_hinge;
  joint_shoulder[lr].setEnabled(is_hinge);
  joint_shoulder6dof[lr].setEnabled(!is_hinge);
}

function startSwing() {
  upsideDown(false);
  setCurJointShoulder(L, true);
  setCurJointShoulder(R, true);

  setHipMaxMotorForce(...params.max_force.hip_init);
  state = {
    main: 'init', entry_num: 0, waza_pos: 0, active_key: null, landing: 0 };
  var waza = start_list[composition_by_num[0]];
  var template = dousa_dict[waza_dict[waza][0][0]];
  enableHelper(true);
  helper_joint.start_angle = degree * waza_dict[waza][0][1].angle;
  for ( var x in template )
    curr_dousa[x] = template[x];

  for ( var i = 0; i < 8; ++i ) {
    controlBody();
    physicsWorld.stepSimulation(0.2, 480, 1./240);
  }

  if ( debug && floor.arrows != null ) {
    scene.remove(spine.spring_arrow);
    for ( var body of air_res_parts )
      scene.remove(body.air_arrow);
  }

  changeButtonSettings();
  showActiveWaza();
  clock.start();
  stopRecording();
  animate();
}

function doReset() {
  // クリックした要素がフォーカスされて、
  // 以降スペースキーやエンターキーを押してもクリックしたことになってしまう
  // ので、フォーカスを外さないといけない。
  document.getElementById('reset').blur();

  // animate()の中でanimationを止めたあと、drResetMain()に飛ぶ
  state.main = 'reset';
}

function doResetMain() {
  /* start-posが変ってここに来る時には、helper_jointが付いたままになっている。
     一度外さないと、start-posが変わる度に helper_jointが一つづつ増えていく */
  enableHelper(false);

  // グリップは有ってもなくても一旦外して後から付け直す
  controlGripMotors(['release', 'release']);

  for ( var [body, transform] of ammo2Initial ) {
    var ms = body.getMotionState();
    ms.setWorldTransform(transform);
    body.setMotionState(ms);
    var zero = new Ammo.btVector3(0, 0, 0);
    body.setLinearVelocity(zero);
    body.setAngularVelocity(zero);

    ammo2Three.get(body).userData.collided = false;
  }

  is_switchst = false;
  for ( var leftright = 0; leftright < 2; ++leftright ) {
    physicsWorld.addConstraint(joint_grip[leftright]);
    joint_grip[leftright].gripping = true;
  }

  shoulder_winding[L] = shoulder_winding[R] = 0;
  last_shoulder_angle[L] = getShoulderAngle(L);
  last_shoulder_angle[R] = getShoulderAngle(R);

  startSwing();
}

function changeButtonSettings() {
  switch ( state.main ) {
  case 'init':
    document.getElementById('composition').removeAttribute('disabled');
    if ( replayInfo.records.length > 3 )
      // 記録が短すぎる時は無視。以降のlengthチェックも楽になる
      document.getElementById('replay').removeAttribute('disabled');
    else
      document.getElementById('replay').setAttribute('disabled', true);
    document.querySelector('#reset').setAttribute('disabled', true);
    for ( var move of document.querySelectorAll('.move')) {
      move.removeAttribute('disabled');
      move.classList.toggle('active', false);
    }
    break;
  case 'run':
    document.getElementById('composition').setAttribute('disabled', true);
    document.getElementById('replay').setAttribute('disabled', true);
    document.querySelector('#reset').removeAttribute('disabled');
    break;
  case 'replay':
    document.getElementById('composition').setAttribute('disabled', true);
    document.getElementById('replay').setAttribute('disabled', true);
    document.querySelector('#reset').removeAttribute('disabled');
    for ( var move of document.querySelectorAll('.move'))
      move.setAttribute('disabled', true);
    break;
  default:
    // 他の状態からはこの関数は呼び出されない
    break;
  }
}

function current_waza() {
  return waza_list[composition_by_num[state.entry_num]];
}

function degrees(radians) {
  return radians.map(function(r) { return r * degree; });
}

function stopRecording() {
}

function startRecording() {
  replayInfo.records = [];
  replayInfo.lastDousaPos = 0;
  replayInfo.active_key = state.active_key;
}

function addKeyRecord(key) {
  replayInfo.records.push({
    delta: 0,
    active_key: key });
}

function addDousaRecord(dousa) {
  var copy = {};

  for ( var x in dousa )
    copy[x] = dousa[x];

  replayInfo.lastDousaPos = replayInfo.records.length;
  replayInfo.records.push({
    dousa: copy,
    entry_num: state.entry_num,
    waza_pos: state.waza_pos,
    delta: 0 });
}

function addDetailsRecord(delta) {
  var details = [],
      p, q, vel, ang;
  for ( var elem of [pelvis, lower_leg[L], lower_leg[R]] ) {
    elem.getMotionState().getWorldTransform(transformAux1);
    p = transformAux1.getOrigin();
    q = transformAux1.getRotation();
    vel = elem.getLinearVelocity();
    ang = elem.getAngularVelocity();
    details.push(
      [[p.x(), p.y(), p.z()],
       [q.x(), q.y(), q.z(), q.w()],
       [vel.x(), vel.y(), vel.z()],
       [ang.x(), ang.y(), ang.z()]]);
  }

  replayInfo.records.push({dousa: null, delta: delta, details: details});
}

function doReplay() {
  document.getElementById('replay').blur();
  if ( state.main != 'init' )
    return;

  state = { main: 'replay', entry_num: 1, waza_pos: 0,
            active_key: replayInfo.active_key, landing: 0 };
  changeButtonSettings();
  replayInfo.replayPos = 0;
  replayInfo.remainingDelta = 0;
  enableHelper(false);
}

Ammo().then(function(AmmoLib) {
  Ammo = AmmoLib;
  init();
  startSwing();
});
