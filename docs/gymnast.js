'use strict';
import * as THREE from './js/three/build/three.module.js';
import * as util from './util.js';
import { params } from   './dataDevel.js';
let debug = false;

const rad_per_deg = Math.PI/180;
const L = 0;
const R = 1;

const gymnast = {
  body: { // 要素は Ammo.btRigidBody
    pelvis: null,
    spine: null,
    chest: null,
    head: null,
    upper_leg: [null, null], // [left_part, right_part]。左右あるパーツは他も同様。
    lower_leg: [null, null],
    upper_arm: [null, null],
    lower_arm: [null, null]
  },

  joint: {
    belly: null,
    breast: null,
    neck: null,
    hip: [null, null],
    knee: [null, null],
    shoulder: [null, null],      // hinge肩
    shoulder6dof: [null, null],  // 3自由度のある肩
    elbow: [null, null],
    landing: [null, null],       // 着地用。upsideDown()の中で作る。
    grip: [null, null],
    grip_switchst: [null, null], // スイッチスタンス(ツイストした時)のグリップ
  },

  motor: {
    hip: [null, null],
    grip: [null, null],
    grip_switchst: [null, null]
  },

  body_parts: [],    // bodyの全要素
  air_res_parts: [], // 着地の時空気抵抗を受けるbodyの要素

  is_switchst: false,          // スイッチスタンスか
  shoulder_winding: [0, 0],    // 肩の角度の巻き付き回数(左右)。離手するとリセット
  last_shoulder_angle: [0, 0], // 前回の肩の角度(-pi .. pi)
  is_hinge_shoulder: [true, true], // 左右の肩のジョイントがhingeか。

  create: null,    // function
  setColors: null, // function
  getCOM: null     // function 全身の重心(THREE.Vector3)を返す。
};

const pelvis_r2 = params.pelvis.size[1];
const spine_r2 = params.spine.size[1], spine_m = 0.13;
const [chest_r1, chest_r2] = params.chest.size; // chest_r3は他では使わない
const head_r2 = params.head.size[1];
const upper_leg_h = params.upper_leg.size[1], upper_leg_x = params.upper_leg.x;
const [lower_leg_r, lower_leg_h] = params.lower_leg.size,
    lower_leg_x = params.lower_leg.x;
const [upper_arm_r, upper_arm_h] = params.upper_arm.size;
const lower_arm_h = params.lower_arm.size[1];

gymnast.create = function(dbg, bar, bar_r) {
  /* bar_r は、resizeParams()で変えられている。
     最初、これに気づかず pelvis_r2とかと同様 staticに定義していた。
     すると、joint.gripの定義を highBarDevel.jsからこちらに移すと逆車が回れなくなる、
     という現象が置き、しばらく悩んだ。

     一応、今は解決しているが、bar_rを引数にするの、情けないので何とかしないと。*/
  const body = this.body,
        joint = this.joint,
        motor = this.motor;

  debug = dbg;

  body.pelvis = util.createEllipsoid(
    ...params.pelvis.size, params.total_weight * params.pelvis.ratio,
    0x0, 0, -1.2, 0);
  body.pelvis.setContactProcessingThreshold(-0.03);

  body.spine = util.createEllipsoid(
    ...params.spine.size, params.total_weight * params.spine.ratio, 0x0,
    0, pelvis_r2 + spine_r2, 0, body.pelvis);
  // デフォルトのままだと腕に胸や腰がぶつかって背面の姿勢になれない
  body.spine.setContactProcessingThreshold(-0.03);

  body.chest = util.createEllipsoid(
    ...params.chest.size, params.total_weight * params.chest.ratio, 0x0,
    0, chest_r2 + spine_r2, 0, body.spine);
  body.chest.setContactProcessingThreshold(-0.03);

  let texture = new THREE.TextureLoader().load('face.png');
  texture.offset.set(-0.25, 0);
  body.head = util.createEllipsoid(
    ...params.head.size, params.total_weight * params.head.ratio, 0x0,
    0, head_r2 + chest_r2, 0, body.chest, texture);

  body.upper_leg[L] = util.createCylinder(
    ...params.upper_leg.size, params.total_weight * params.upper_leg.ratio, 0x0,
    -upper_leg_x, -(pelvis_r2 + upper_leg_h/2), 0, body.pelvis);
  body.upper_leg[R] = util.createCylinder(
    ...params.upper_leg.size, params.total_weight * params.upper_leg.ratio, 0x0,
    upper_leg_x, -(pelvis_r2 + upper_leg_h/2), 0, body.pelvis);

  body.lower_leg[L] = util.createCylinder(
    ...params.lower_leg.size, params.total_weight * params.lower_leg.ratio, 0x0,
    -lower_leg_x, -upper_leg_h/2 - lower_leg_h/2, 0, body.upper_leg[L]);
  body.lower_leg[R] = util.createCylinder(
    ...params.lower_leg.size, params.total_weight * params.lower_leg.ratio, 0x0,
    lower_leg_x, -upper_leg_h/2 - lower_leg_h/2, 0, body.upper_leg[R]);

  // 着地処理に使う見えない目印を足先に付ける。
  let mark_point = new THREE.Mesh(
    new THREE.SphereBufferGeometry(.1, 1, 1),
    new THREE.MeshPhongMaterial({visible:false}));
  mark_point.position.set(0, -lower_leg_h/2, 0);
  body.lower_leg[L].three.add(mark_point);
  body.lower_leg[L].mark_point = mark_point;
  mark_point = mark_point.clone();
  body.lower_leg[R].three.add(mark_point);
  body.lower_leg[R].mark_point = mark_point;

  body.upper_arm[L] = util.createCylinder(
    ...params.upper_arm.size, params.total_weight * params.upper_arm.ratio, 0x0,
    -chest_r1 - upper_arm_r, chest_r2 + upper_arm_h/2, 0, body.chest);
  body.upper_arm[R] = util.createCylinder(
    ...params.upper_arm.size, params.total_weight * params.upper_arm.ratio, 0x0,
    chest_r1 + upper_arm_r, chest_r2 + upper_arm_h/2, 0, body.chest);

  if ( debug ) {
    body.upper_arm[L].three.add(new THREE.AxesHelper(3));
    body.upper_arm[R].three.add(new THREE.AxesHelper(3));
  }

  body.lower_arm[L] = util.createCylinder(
    ...params.lower_arm.size, params.total_weight * params.lower_arm.ratio, 0x0,
    0, upper_arm_h/2 + lower_arm_h/2, 0, body.upper_arm[L]);
  body.lower_arm[R] = util.createCylinder(
    ...params.lower_arm.size, params.total_weight * params.lower_arm.ratio, 0x0,
    0, upper_arm_h/2 + lower_arm_h/2, 0, body.upper_arm[R]);
  addHandToArm(body.lower_arm[L], lower_arm_h/2 + bar_r);
  addHandToArm(body.lower_arm[R], lower_arm_h/2 + bar_r);

  // 空気抵抗を受ける箇所
  this.air_res_parts = [body.pelvis, body.spine, body.chest, body.head];
  this.body_parts = [
    ...this.air_res_parts,
    ...body.upper_leg, ...body.lower_leg,...body.upper_arm, ...body.lower_arm];

  joint.belly = util.createConeTwist(
    body.pelvis, [0, pelvis_r2, 0], null,
    body.spine, [0, -spine_r2, 0], null,
    params.flexibility.belly);

  joint.breast = util.createConeTwist(
    body.spine, [0, spine_r2, 0], null,
    body.chest, [0, -chest_r2, 0], null,
    params.flexibility.breast);

  joint.neck = util.createConeTwist(
    body.chest, [0, chest_r2, 0], null,
    body.head, [0, -head_r2, 0], null,
    params.flexibility.neck);

  joint.belly.enableMotor(true);
  joint.breast.enableMotor(true);
  joint.neck.enableMotor(true);

  /* 骨盤の自由度は、膝を前に向けたまま脚を横に開く事は殆ど出来なくした。
     横に開く為には膝を横に向けないといけない。
     但し、完全に自由度を一つロックすると、不安定な動作を示す時があったので、
     一応少しだけ動くようにはした(技の動作では指定させない)。

     脚を横に開いて膝を曲げた時、足首を下に持っていく事は出来るが、
     足首を後には持っていけない。
     そういう姿勢になる鉄棒の技は多分無いので良い */
  joint.hip[L] = util.create6Dof(
    body.pelvis, [-upper_leg_x, -pelvis_r2, 0], [0, 0, 0],
    body.upper_leg[L], [0, upper_leg_h/2, 0], [0, 0, 0],
    [params.flexibility.hip.shift_min, params.flexibility.hip.shift_max,
     params.flexibility.hip.angle_min, params.flexibility.hip.angle_max]);
  joint.hip[R] = util.create6Dof(
    body.pelvis, [upper_leg_x, -pelvis_r2, 0], [0, 0, 0],
    body.upper_leg[R], [0, upper_leg_h/2, 0], [0, 0, 0],
    [params.flexibility.hip.shift_min, params.flexibility.hip.shift_max,
     params.flexibility.hip.angle_min, params.flexibility.hip.angle_max],
    'mirror');


  // HingeConstraintを繋ぐ順番によって左右不均等になってしまう。
  // どうやって修正していいか分からないが、誰でも利き腕はあるので、
  // 当面気にしない。
  joint.knee[L] = util.createHinge(
    body.upper_leg[L], [upper_leg_x - lower_leg_x, -upper_leg_h/2, 0], null,
    body.lower_leg[L], [0, lower_leg_h/2, 0], null,
    params.flexibility.knee);
  joint.knee[R] = util.createHinge(
    body.upper_leg[R], [-upper_leg_x + lower_leg_x, -upper_leg_h/2, 0], null,
    body.lower_leg[R], [0, lower_leg_h/2, 0], null,
    params.flexibility.knee);

  createShoulderJoint(body, joint);

  let x_axis = new Ammo.btVector3(1, 0, 0),
      y_axis = new Ammo.btVector3(0, 1, 0),
      axis = x_axis.rotate(y_axis, -120*rad_per_deg); // dataに移さず、まだ直書き
  joint.elbow[L] = util.createHinge(
    body.upper_arm[L], [0, upper_arm_h/2, 0], axis,
    body.lower_arm[L], [0, -lower_arm_h/2, 0], axis,
    params.flexibility.elbow);
  axis = x_axis.rotate(y_axis, 120*rad_per_deg); // dataに移さず、まだ直書き
  joint.elbow[R] = util.createHinge(
    body.upper_arm[R], [0, upper_arm_h/2, 0], axis,
    body.lower_arm[R], [0, -lower_arm_h/2, 0], axis,
    params.flexibility.elbow);

  joint.grip[L] = util.create6Dof(
    bar, [-chest_r1 - upper_arm_r, 0, 0], [Math.PI/2, 0, 0],
    body.lower_arm[L], [0, lower_arm_h/2 + bar_r, 0], null,
    [params.flexibility.grip.shift_min, params.flexibility.grip.shift_max,
     params.flexibility.grip.angle_min, params.flexibility.grip.angle_max]);
  joint.grip[L].gripping = true; // crete6Dof内でaddConstraintしてるので
  joint.grip[R] = util.create6Dof(
    bar, [chest_r1 + upper_arm_r, 0, 0], [Math.PI/2, 0, 0],
    body.lower_arm[R], [0, lower_arm_h/2 + bar_r, 0], null,
    [params.flexibility.grip.shift_min, params.flexibility.grip.shift_max,
     params.flexibility.grip.angle_min, params.flexibility.grip.angle_max]);
  joint.grip[R].gripping = true; // crete6Dof内でaddConstraintしてるので

  // ツイスト、逆車移行して体の向きが変った時(スイッチスタンス)のグリップ。
  // 現在は右手が軸手で、右手は握る位置は同じだが、逆手にならないように、
  // スイッチスタンスになる時に右手も握り替えて順手にする。
  joint.grip_switchst[L] = util.create6Dof(
    bar, [3 * (chest_r1 + upper_arm_r), 0, 0], [-Math.PI/2, Math.PI, 0],
    body.lower_arm[L], [0, lower_arm_h/2 + bar_r, 0], null,
    [params.flexibility.grip.shift_min, params.flexibility.grip.shift_max,
     params.flexibility.grip.angle_min, params.flexibility.grip.angle_max]);
  joint.grip_switchst[L].gripping = false;
  joint.grip_switchst[R] = util.create6Dof(
    bar, [chest_r1 + upper_arm_r, 0, 0], [-Math.PI/2, Math.PI, 0],
    body.lower_arm[R], [0, lower_arm_h/2 + bar_r, 0], null,
    [params.flexibility.grip.shift_min, params.flexibility.grip.shift_max,
     params.flexibility.grip.angle_min, params.flexibility.grip.angle_max]);
  joint.grip_switchst[R].gripping = false;

  motor.hip = [
    [joint.hip[L].getRotationalLimitMotor(0),
     joint.hip[L].getRotationalLimitMotor(1),
     joint.hip[L].getRotationalLimitMotor(2)],
    [joint.hip[R].getRotationalLimitMotor(0),
     joint.hip[R].getRotationalLimitMotor(1),
     joint.hip[R].getRotationalLimitMotor(2)]];

  motor.grip = [
    [joint.grip[L].getRotationalLimitMotor(0), // x軸回りは使わない
     joint.grip[L].getRotationalLimitMotor(1),
     joint.grip[L].getRotationalLimitMotor(2)],
    [joint.grip[R].getRotationalLimitMotor(0), // x軸回りは使わない
     joint.grip[R].getRotationalLimitMotor(1),
     joint.grip[R].getRotationalLimitMotor(2)]];
  motor.grip_switchst = [
    [joint.grip_switchst[L].getRotationalLimitMotor(0),
     joint.grip_switchst[L].getRotationalLimitMotor(1),
     joint.grip_switchst[L].getRotationalLimitMotor(2)],
    [joint.grip_switchst[R].getRotationalLimitMotor(0),
     joint.grip_switchst[R].getRotationalLimitMotor(1),
     joint.grip_switchst[R].getRotationalLimitMotor(2)]];
};

gymnast.setColors = function(gui_params) {
  let skin_color = gui_params['肌の色'],
      color1 = gui_params['色1'],
      color2 = gui_params['色2'],
      leg_color =  gui_params['長パン'] ? color2 : skin_color,
      obj;

  for ( let x of [...this.body.upper_arm, ...this.body.lower_arm] )
    x.three.material.color.set(skin_color);
  obj = this.body.head.three.children[0];
  obj.material.color.set(skin_color);

  for ( let x of [this.body.spine, this.body.chest] )
    x.three.material.color.set(color1);

  this.body.pelvis.three.material.color.set(color2);

  /* 足の色を短パン、長パンに合うように決める。

     指摘があるまで、鉄棒なのに短パンを履いていた。恥ずかしい。
     各種の説明動画などを作り直したり、色が違っていると断りを入れるのは大変なので、
     デフォルトでは短パンを履いたままにして、
     GUIで指定した時だけ長パンを履くようにして誤魔化すことにした。 */
  for ( let x of [...this.body.upper_leg, ...this.body.lower_leg] )
    x.three.material.color.set(leg_color);
}

gymnast.getCOM = function() {
  let com = [0, 0, 0],
      num = this.body_parts.length;

  for ( let part of this.body_parts ) {
    let p = part.getCenterOfMassPosition();
    com[0] += p.x() / num;
    com[1] += p.y() / num;
    com[2] += p.z() / num;
  }

  return new THREE.Vector3(...com);
}

function addHandToArm(arm, y) {
  let arm_obj = arm.three;
  let geom = new THREE.SphereBufferGeometry(params.hand.size, 5, 5);
  let hand = new THREE.Mesh(
    geom, new THREE.MeshPhongMaterial({color: params.hand.color}));
  hand.position.set(0, y, 0);
  arm_obj.add(hand);
  arm_obj.hand = hand;
}

function createShoulderJoint(body, joint) {
  /* 肩は、HingeConstrと 6DofSpring2Constrの二つのモーター付きジョイントで固定し、
     動作によってどちらか一方のモーターのみを利用する。

     これは、従来、HingeConstrのみで固定していて、各技、各動作のパラメーターを
     そちら用に調整していて、新しく自由度を増やした 6DofConstr用に
     調整し直すのが難しいため。 */
  for ( let lr = L; lr <= R; ++lr ) {
    let sign = (lr == L ? -1 : +1);
    joint.shoulder[lr] = util.createHinge(
      body.chest, [sign * chest_r1, chest_r2, 0], null,
      body.upper_arm[lr], [-sign * upper_arm_r, -upper_arm_h/2, 0],
      null, null);

    joint.shoulder6dof[lr] = util.create6Dof(
      body.chest, [sign * chest_r1, chest_r2, 0], null,
      body.upper_arm[lr], [-sign * upper_arm_r, -upper_arm_h/2, 0], null,
      [params.flexibility.shoulder.shift_min,
       params.flexibility.shoulder.shift_max,
       params.flexibility.shoulder.angle_min,
       params.flexibility.shoulder.angle_max],
      null, Ammo.RO_YZX); // btGeneric6DofSpring2Constraint
  }
}

export {gymnast};
