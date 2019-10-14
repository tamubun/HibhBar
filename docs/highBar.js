'use strict';
import * as THREE from './js/three/build/three.module.js';
import { TrackballControls } from
  './js/three/examples/jsm/controls/TrackballControls.js';

const degree = Math.PI/180;
var touchScreenFlag = false;  // マウスイベントとタッチイベント両方が起きないようにする

var camera, scene, renderer, control;
var physicsWorld;
var clock = new THREE.Clock();

var transformAux1;
var rigidBodies = [];
var ammo2Three = new Map();
var ammo2Initial = new Map();

var state;

var bar;

var pelvis, spine, chest, head,
	left_upper_leg, left_lower_leg, right_upper_leg, right_lower_leg,
	left_upper_arm, left_lower_arm, right_upper_arm, right_lower_arm;

var joint_pelvis_spine, joint_spine_chest, joint_chest_head,
	joint_left_hip, joint_left_knee, joint_left_shoulder, joint_left_elbow,
	joint_right_hip, joint_right_knee, joint_right_shoulder, joint_right_elbow,
	helper_motor;

var joint_left_grip, joint_right_grip;

var params = {
  /* 全体重。各パーツの重さの違いが大きいと、なぜか手とバーとの接合部が
	 引っ張られすぎてしまうので、実際の体重比
	 (http://www.tukasa55.com/staff-blog/?p=5666等)からずらさないといかん */
  total_weight: 68.0,

  bar: {size: [0.024, 2.4], mass: 10, color: 0xffffff,
		spring: 4.5e+4, damping: 5.0e-6},

  pelvis: {size: [0.16, 0.10, 0.10], ratio: 0.14, color: 0x0000ff},
  spine: {size: [0.14, 0.10, 0.09], ratio: 0.13, color: 0xffffff},
  chest: {size: [0.1505, 0.10, 0.105], ratio: 0.17, color: 0xffffff},
  head: {size: [0.09, 0.14, 0.11], ratio: 0.08, color: 0x888800},
  upper_leg: {size: [0.08, 0.50], ratio: 0.07, color: 0x888800, x: 0.08},
  lower_leg: {size: [0.05, 0.60], ratio: 0.07, color: 0x888800, x: 0.065},
  upper_arm: {size: [0.045, 0.30], ratio: 0.05, color: 0x888800},
  lower_arm: {size: [0.03, 0.40], ratio: 0.05, color: 0x888800},

  helper: {angle: -160}
}

function init() {
  initInput();
  initGraphics();
  initPhysics();
  createObjects();
}

function initInput() {
  var change = function() {
	state += 1;
	if ( state > 5 )
	  state = 2;
	document.querySelector('#movement').toggleAttribute(
	  "active", state % 2 == 1);
  };

  var spacedown = function() {
	if ( state % 2 != 0 )
	  return;
	change();
  };

  var spaceup = function() {
	if ( state % 2 == 0 )
	  return;
	change();
  };

  var keyevent = function(ev) {
	switch ( ev.keyCode ) {
	case 32: // ' ':
	  if ( ev.type == 'keydown' )
		spacedown();
	  else if ( ev.type == 'keyup' )
		spaceup();
	  break;

	default:
	  break;
	}
  }

  window.addEventListener('keydown', keyevent, false);
  window.addEventListener('keyup', keyevent, false);
  document.getElementById('reset').addEventListener('click', doReset, false);
  var movement = document.querySelector('#movement');
  movement.addEventListener('mousedown', function() {
	if ( touchScreenFlag ) {
	  touchScreenFlag = false;
	  return;
	}
	spacedown();
  }, false);
  movement.addEventListener('mouseup', function() {
	if ( touchScreenFlag ) {
	  touchScreenFlag = false;
	  return;
	}
	spaceup();
  }, false);
  movement.addEventListener('touchstart', function() {
	touchScreenFlag = true;
	spacedown();
  }, false);
  movement.addEventListener('touchend', function() {
	touchScreenFlag = true;
	spaceup();
  }, false);
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
  var [bar_r, bar_l] = params.bar.size;
  var pelvis_r2 = params.pelvis.size[1];
  var spine_r2 = params.spine.size[1], spine_m = 0.13;
  var [chest_r1, chest_r2] = params.chest.size; // chest_r3は他では使わない
  var head_r2 = params.head.size[1];
  var upper_leg_h = params.upper_leg.size[1], upper_leg_x = params.upper_leg.x;
  var lower_leg_h = params.lower_leg.size[1], lower_leg_x = params.lower_leg.x;
  var [upper_arm_r, upper_arm_h] = params.upper_arm.size;
  var lower_arm_h = params.lower_arm.size[1];

  /* Three.jsの CylinderはY軸に沿った物しか用意されてない。
	 X軸に沿うように回転させると、Bulletの方にまでその回転が反映されてしまい
	 座標変換がややこしくなるので、画面に見えるバーとBulletに対応付けるバーを
	 分けて扱う、という小細工をする */
  var dummy_object = new THREE.Mesh(
	new THREE.CylinderBufferGeometry(bar_r, bar_r, bar_l, 1, 1),
	new THREE.MeshPhongMaterial({visible: false})); // 見せない
  var visible_object = new THREE.Mesh(
	new THREE.CylinderBufferGeometry(bar_r, bar_r, bar_l, 10, 1),
	new THREE.MeshPhongMaterial({color: params.bar.color}));
  visible_object.rotation.set(0, 0, Math.PI/2);
  dummy_object.add(visible_object);
  var shape = new Ammo.btCylinderShapeX(
	new Ammo.btVector3(bar_l/2, bar_r, bar_r));
  bar = createRigidBody(dummy_object, shape, params.bar.mass);

  pelvis = createEllipsoid(
	...params.pelvis.size, params.pelvis.ratio, params.pelvis.color,
	0, -1.2, 0);

  spine = createEllipsoid(
	...params.spine.size, params.spine.ratio, params.spine.color,
	0, pelvis_r2 + spine_r2, 0, pelvis);

  chest = createEllipsoid(
	...params.chest.size, params.chest.ratio, params.chest.color,
	0, chest_r2 + spine_r2, 0, spine);

  var texture = THREE.ImageUtils.loadTexture('face.png');
  texture.offset.set(-0.25, 0);
  head = createEllipsoid(
	...params.head.size, params.head.ratio, params.head.color,
	0, head_r2 + chest_r2, 0, chest, texture);

  left_upper_leg = createCylinder(
	...params.upper_leg.size, params.upper_leg.ratio, params.upper_leg.color,
	-upper_leg_x, -(pelvis_r2 + upper_leg_h/2), 0, pelvis);
  right_upper_leg = createCylinder(
	...params.upper_leg.size, params.upper_leg.ratio, params.upper_leg.color,
	upper_leg_x, -(pelvis_r2 + upper_leg_h/2), 0, pelvis);

  left_lower_leg = createCylinder(
	...params.lower_leg.size, params.lower_leg.ratio, params.lower_leg.color,
	-lower_leg_x, -upper_leg_h/2 - lower_leg_h/2, 0, left_upper_leg);
  right_lower_leg = createCylinder(
	...params.lower_leg.size, params.lower_leg.ratio, params.lower_leg.color,
	lower_leg_x, -upper_leg_h/2 - lower_leg_h/2, 0, right_upper_leg);

  left_upper_arm = createCylinder(
	...params.upper_arm.size, params.upper_arm.ratio, params.upper_arm.color,
	-chest_r1 - upper_arm_r, chest_r2 + upper_arm_h/2, 0, chest);
  right_upper_arm = createCylinder(
	...params.upper_arm.size, params.upper_arm.ratio, params.upper_arm.color,
	chest_r1 + upper_arm_r, chest_r2 + upper_arm_h/2, 0, chest);

  left_lower_arm = createCylinder(
	...params.lower_arm.size, params.lower_arm.ratio, params.lower_arm.color,
	0, upper_arm_h/2 + lower_arm_h/2, 0, left_upper_arm);
  right_lower_arm = createCylinder(
	...params.lower_arm.size, params.lower_arm.ratio, params.lower_arm.color,
	0, upper_arm_h/2 + lower_arm_h/2, 0, right_upper_arm);

  joint_pelvis_spine = createConeTwist(
	pelvis, [0, pelvis_r2, 0], null,
	spine, [0, -spine_r2, 0], null,
	[Math.PI/4, Math.PI/4, Math.PI/4]);

  joint_spine_chest = createConeTwist(
	spine, [0, spine_r2, 0], null,
	chest, [0, -chest_r2, 0], null,
	[Math.PI/4, Math.PI/4, Math.PI/4]);

  joint_chest_head = createConeTwist(
	chest, [0, chest_r2, 0], null,
	head, [0, -head_r2, 0], null,
	[Math.PI/2, Math.PI/3, Math.PI/3]);

  // HingeConstraintを繋ぐ順番によって左右不均等になってしまう。
  // どうやって修正していいか分からないが、誰でも利き腕はあるので、
  // 当面気にしない。
  joint_left_hip = createHinge(
	pelvis, [-upper_leg_x, -pelvis_r2, 0], null,
	left_upper_leg, [0, upper_leg_h/2, 0], null);

  joint_left_knee = createHinge(
	left_upper_leg, [upper_leg_x - lower_leg_x, -upper_leg_h/2, 0], null,
	left_lower_leg, [0, lower_leg_h/2, 0], null,
	[-degree*170, degree*4]);

  joint_left_shoulder = createHinge(
	chest, [-chest_r1, chest_r2, 0], null,
	left_upper_arm, [upper_arm_r, -upper_arm_h/2, 0], null);

  joint_left_elbow = createHinge(
	left_upper_arm, [0, upper_arm_h/2, 0], null,
	left_lower_arm, [0, -lower_arm_h/2, 0], null,
	[-degree*170, degree*2]);

  joint_right_hip = createHinge(
	pelvis, [upper_leg_x, -pelvis_r2, 0], null,
	right_upper_leg, [0, upper_leg_h/2, 0], null);

  joint_right_knee = createHinge(
	right_upper_leg, [-upper_leg_x + lower_leg_x, -upper_leg_h/2, 0], null,
	right_lower_leg, [0, lower_leg_h/2, 0], null,
	[-degree*170, degree*4]);

  joint_right_shoulder = createHinge(
	chest, [chest_r1, chest_r2, 0], null,
	right_upper_arm, [-upper_arm_r, -upper_arm_h/2, 0], null);

  joint_right_elbow = createHinge(
	right_upper_arm, [0, upper_arm_h/2, 0], null,
	right_lower_arm, [0, -lower_arm_h/2, 0], null,
	[-degree*170, degree*2]);

  joint_left_grip = createHinge(
	bar, [-chest_r1 - upper_arm_r, 0, 0], null,
	left_lower_arm, [0, lower_arm_h/2 + bar_r, 0], null);

  joint_right_grip = createHinge(
	bar, [chest_r1 + upper_arm_r, 0, 0], null,
	right_lower_arm, [0, lower_arm_h/2 + bar_r, 0], null);

  // 最初に体をtarget_angleまで持ち上げる
  var target_angle = degree * params.helper.angle;
  var p = ammo2Three.get(pelvis).position;
  var transform = new Ammo.btTransform();
  transform.setIdentity();
  transform.setOrigin(new Ammo.btVector3(-p.x, -p.y, -p.z));
  transform.getBasis().setEulerZYX(...[0, -Math.PI/2, 0]);
  // Generic6DofSpringConstraintに繋いだ barに繋ぐと何故かモーターが効かない
  helper_motor = new Ammo.btHingeConstraint(pelvis, transform, true);

  transform.setIdentity();
  var spring =
	  new Ammo.btGeneric6DofSpringConstraint(bar, transform, true);
  spring.setLinearLowerLimit(new Ammo.btVector3(0, -2, -2));
  spring.setLinearUpperLimit(new Ammo.btVector3(0, 2, 2));
  spring.setAngularLowerLimit(new Ammo.btVector3(0, 0, 0));
  spring.setAngularUpperLimit(new Ammo.btVector3(0, 0, 0));
  spring.enableSpring(1, true);
  spring.setStiffness(1, params.bar.spring);
  spring.setDamping(1, params.bar.damping);
  spring.enableSpring(2, true);
  spring.setStiffness(2, params.bar.spring);
  spring.setDamping(2, params.bar.damping);
  physicsWorld.addConstraint(spring);
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

function createConeTwist(
  objA, posA, eulerA = null, objB, posB, eulerB = null, limit = null)
{
  /* ConeTwistConstraint.setLimit(3,θx), setLimit(4,θy), setLimit(5,θz)

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
	joint.setLimit(limit[0], limit[1], 0.9, 0.3, 1);

  physicsWorld.addConstraint(joint, true);
  return joint;
}

function makeConvexShape(geom) {
  var shape = new Ammo.btConvexHullShape();
  var index = geom.getIndex();
  var pts = geom.getAttribute('position');
  for ( var i = 0; i < index.count; ++i )
	shape.addPoint(new Ammo.btVector3(pts.getX(i), pts.getY(i), pts.getZ(i)));

  return shape;
}

function onWindowResize() {
  var container = document.getElementById('container');
  camera.aspect = container.offsetWidth / container.offsetHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.offsetWidth, container.offsetHeight);
}

function animate() {
  if ( state == -1 ) { // reset
	doResetMain();
	return;
  }

  requestAnimationFrame(animate);
  render();
}

function render() {
  var deltaTime = clock.getDelta();

  updatePhysics(deltaTime);
  control.update();
  renderer.render(scene, camera);
}

function updatePhysics(deltaTime) {
  moveMotor(state);
  physicsWorld.stepSimulation(deltaTime, 480, 1/240.);

  // Update rigid bodies
  for ( var i = 0, il = rigidBodies.length; i < il; i ++ ) {
	var objThree = rigidBodies[i];
	var objPhys = objThree.userData.physicsBody;
	var ms = objPhys.getMotionState();

	if ( ms ) {
	  ms.getWorldTransform(transformAux1);
	  var p = transformAux1.getOrigin();
	  var q = transformAux1.getRotation();
	  objThree.position.set(p.x(), p.y(), p.z());
	  objThree.quaternion.set(q.x(), q.y(), q.z(), q.w());

	  objThree.userData.collided = false;
	}
  }
}

function moveMotor(state) {
  var q = new Ammo.btQuaternion();

  joint_left_knee.setMotorTarget(0, 0.1);
  joint_right_knee.setMotorTarget(0, 0.1);
  joint_left_elbow.setMotorTarget(0, 0.1);
  joint_right_elbow.setMotorTarget(0, 0.1);

  switch ( state ) {
  case 0: // 初期状態
	helper_motor.setMotorTarget(degree * params.helper.angle, 1);
	joint_left_hip.setMotorTarget(0, 0.1);
	joint_left_shoulder.setMotorTarget(0, 0.1);
	joint_right_hip.setMotorTarget(0, 0.1);
	joint_right_shoulder.setMotorTarget(0, 0.1);

	/* setEulerZYXの引数の順に注意。
	   btQuaternion.setEulerZYX(z,y,x):
	   btTransform.getBasis.setEulerZYX(x,y,z): vectorはx,y,zの順に回されるとある */
	q.setEulerZYX(0, 0, 0);
	joint_chest_head.setMotorTarget(q);
	q.setEulerZYX(0, 0, 0);
	joint_spine_chest.setMotorTarget(q);
	q.setEulerZYX(0, 0, 0);
	joint_pelvis_spine.setMotorTarget(q);
	break;
  case 1: // start & 押し
	physicsWorld.removeConstraint(helper_motor);
	joint_left_hip.setMotorTarget(degree*4, 0.1);
	joint_left_shoulder.setMotorTarget(-degree*5, 0.1);
	joint_right_hip.setMotorTarget(degree*4, 0.1);
	joint_right_shoulder.setMotorTarget(-degree*5, 0.1);

	q.setEulerZYX(0, 0, degree*3);
	joint_chest_head.setMotorTarget(q);
	q.setEulerZYX(0, 0, degree*2);
	joint_spine_chest.setMotorTarget(q);
	q.setEulerZYX(0, 0, degree*2);
	joint_pelvis_spine.setMotorTarget(q);
	break;
  case 2: // 抜き
	joint_left_hip.setMotorTarget(-degree*15, 0.3);
	joint_left_shoulder.setMotorTarget(degree*10, 0.3);
	joint_right_hip.setMotorTarget(-degree*15, 0.3);
	joint_right_shoulder.setMotorTarget(degree*10, 0.3);

	q.setEulerZYX(0, 0, degree*3);
	joint_chest_head.setMotorTarget(q);
	q.setEulerZYX(0, 0, -degree*10);
	joint_spine_chest.setMotorTarget(q);
	q.setEulerZYX(0, 0, -degree*10);
	joint_pelvis_spine.setMotorTarget(q);
	break;
  case 3: // あふり
	joint_left_hip.setMotorTarget(degree*20, 0.35);
	joint_left_shoulder.setMotorTarget(-degree*20, 0.35);
	joint_right_hip.setMotorTarget(degree*20, 0.35);
	joint_right_shoulder.setMotorTarget(-degree*20, 0.35);

	q.setEulerZYX(0, 0, degree*5);
	joint_chest_head.setMotorTarget(q);
	q.setEulerZYX(0, 0, degree*15);
	joint_spine_chest.setMotorTarget(q);
	q.setEulerZYX(0, 0, degree*15);
	joint_pelvis_spine.setMotorTarget(q);
	break;
  case 4: // あふり終り
	joint_left_hip.setMotorTarget(degree*10, 0.7);
	joint_left_shoulder.setMotorTarget(-degree*10, 0.8);
	joint_right_hip.setMotorTarget(degree*10, 0.7);
	joint_right_shoulder.setMotorTarget(-degree*10, 0.8);

	q.setEulerZYX(0, 0, degree*3);
	joint_chest_head.setMotorTarget(q);
	q.setEulerZYX(0, 0, degree*7);
	joint_spine_chest.setMotorTarget(q);
	q.setEulerZYX(0, 0, degree*7);
	joint_pelvis_spine.setMotorTarget(q);
	break;
  case 5: // 押し
	joint_left_hip.setMotorTarget(degree*4, 0.3);
	joint_left_shoulder.setMotorTarget(-degree*5, 0.3);
	joint_right_hip.setMotorTarget(degree*4, 0.3);
	joint_right_shoulder.setMotorTarget(-degree*5, 0.3);

	q.setEulerZYX(0, 0, degree*3);
	joint_chest_head.setMotorTarget(q);
	q.setEulerZYX(0, 0, degree*2);
	joint_spine_chest.setMotorTarget(q);
	q.setEulerZYX(0, 0, degree*2);
	joint_pelvis_spine.setMotorTarget(q);
	break;
  default:
	break;
  }
}

function startSwing() {
  joint_left_hip.enableAngularMotor(true, 0, 1.2);
  joint_left_knee.enableAngularMotor(true, 0, 0.9);
  joint_left_shoulder.enableAngularMotor(true, 0, 0.8);
  joint_left_elbow.enableAngularMotor(true, 0, 0.7);
  joint_right_hip.enableAngularMotor(true, 0, 1.2);
  joint_right_knee.enableAngularMotor(true, 0, 0.9);
  joint_right_shoulder.enableAngularMotor(true, 0, 0.8);
  joint_right_elbow.enableAngularMotor(true, 0, 0.7);

  var q = new Ammo.btQuaternion();
  q.setEulerZYX(0, 0, 0);

  joint_chest_head.setMotorTarget(q);
  joint_chest_head.setMaxMotorImpulse(0.4);
  joint_chest_head.enableMotor(true);
  joint_spine_chest.setMotorTarget(q);
  joint_spine_chest.setMaxMotorImpulse(0.8);
  joint_spine_chest.enableMotor(true);
  joint_pelvis_spine.setMotorTarget(q);
  joint_pelvis_spine.setMaxMotorImpulse(0.8);
  joint_pelvis_spine.enableMotor(true);

  var target_angle = degree * params.helper.angle;
  helper_motor.setMaxMotorImpulse(200);
  helper_motor.enableMotor(true);
  physicsWorld.addConstraint(helper_motor);
  for ( var i = 0; i < 20; ++i ) {
	helper_motor.setMotorTarget(target_angle, 1);
	physicsWorld.stepSimulation(0.2, 480, 1./240);
  }
}

function doReset() {
  // resetボタンをクリックするとフォーカスされて、
  // 以降スペースキーやエンターキーを押してもクリックしたことになってしまう
  // ので、フォーカスを外さないといけない。
  document.getElementById('reset').blur();

  if ( state == 0 )
	return;

  // animate()の中でanimationを止めたあと、drResetMain()に飛ぶ
  state = -1;
}

function doResetMain() {
  for ( var [body, transform] of ammo2Initial ) {
	var ms = body.getMotionState();
	ms.setWorldTransform(transform);
	body.setMotionState(ms);
	var zero = new Ammo.btVector3(0, 0, 0);
	body.setLinearVelocity(zero);
	body.setAngularVelocity(zero);

	ammo2Three.get(body).userData.collided = false;
  }

  startSwing();
  state = 0;
  clock.start();
  animate();
}

Ammo().then(function(AmmoLib) {
  Ammo = AmmoLib;
  init();
  startSwing();
  state = 0;
  clock.start();
  animate();
});
