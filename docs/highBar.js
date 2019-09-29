'use strict';
import * as THREE from './js/three/build/three.module.js';
import { TrackballControls } from
  './js/three/examples/jsm/controls/TrackballControls.js';

var camera, scene, renderer, control;
var physicsWorld;
var clock = new THREE.Clock();

var pos = new THREE.Vector3();
var vec = new THREE.Vector3();
var quat = new THREE.Quaternion();
var transformAux1;
var rigidBodies = [];

var bar;

var pelvis, spine, chest, head,
	left_upper_leg, left_lower_leg, right_upper_leg, right_lower_leg,
	left_upper_arm, left_lower_arm, right_upper_arm, right_lower_arm;

var joint_pelvis_spine, joint_spine_chest, joint_chest_head,
	joint_left_hip, joint_left_knee, joint_left_shoulder, joint_left_elbow,
	joint_right_hip, joint_right_knee, joint_right_shoulder, joint_right_elbow,
	helper_motor;

var joint_left_grip, joint_right_grip;

function init() {
  initInput();
  initGraphics();
  initPhysics();
  createObjects();
}

function initInput() {
  window.addEventListener('keyup', function (event) {
	switch ( event.keyCode ) {
	case 65: // A
	  break;
	case 66: // B
	  break;
	}
  }, false);
}

function initGraphics() {
  var container = document.getElementById('container');
  camera = new THREE.PerspectiveCamera(
	60, window.innerWidth / window.innerHeight, 0.2, 2000);
  camera.position.set(7, 0, 3);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfd1e5);
  renderer = new THREE.WebGLRenderer();
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
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
  // カメラの位置を変えても controlが上書きするので、こちらを変える。行儀良くないかも。
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
  var object, shape, geom, vertices;
  var pivotA, pivotB, axisA, axisB;
  var transform1 = new Ammo.btTransform(), transform2 = new Ammo.btTransform();
  var y_offset = -1.2;
  var i;

  var bar_r = 0.024, bar_h = 2.4, bar_m = 10;
  geom = new THREE.CylinderBufferGeometry(bar_r, bar_r, bar_h, 10, 1);
  object =
	new THREE.Mesh(geom, new THREE.MeshPhongMaterial({color: 0xffffff}));
  shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(bar_r, bar_h/2, bar_r));
  pos.set(0, 0, 0);
  vec.set(0, 0, 1);
  quat.setFromAxisAngle(vec, Math.PI/2);
  bar = createRigidBody(object, shape, 0, pos, quat); // 当面、バーの重さ 0

  vec.set(0, 0, 1);
  quat.setFromAxisAngle(vec, 0);

  /* 全体重。各パーツの重さの違いが大きいと、なぜか手とバーとの接合部が引っ張られすぎてしまうので、
	 実際の体重比(http://www.tukasa55.com/staff-blog/?p=5666等)からずらさないといかん */
  var total_weight = 68.0;

  var pelvis_r1 = 0.16, pelvis_r2 = 0.10, pelvis_h = 0.20,
	pelvis_m = total_weight * 0.14;
  geom = new THREE.SphereBufferGeometry(1, 8, 8)
	.scale(pelvis_r1, pelvis_h/2, pelvis_r2);
  object = new THREE.Mesh(
	geom, new THREE.MeshPhongMaterial({color: 0x0000ff}));
  shape = makeConvexShape(geom);
  pos.set(0, y_offset, 0);
  pelvis = createRigidBody(object, shape, pelvis_m, pos, quat);

  var spine_r1 = 0.14, spine_r2 = 0.09, spine_h = 0.20,
	spine_m = total_weight * 0.13;
  geom = new THREE.SphereBufferGeometry(1, 8, 8)
	.scale(spine_r1, spine_h/2, spine_r2),
  object = new THREE.Mesh(
	geom, new THREE.MeshPhongMaterial({color: 0xffffff}));
  shape = makeConvexShape(geom);
  pos.set(0, y_offset + (pelvis_h + spine_h)/2, 0);
  spine = createRigidBody(object, shape, spine_m, pos, quat);

  var chest_r1 = 0.1505, chest_r2 = 0.105, chest_h = 0.20,
	chest_m = total_weight * 0.17;
  geom = new THREE.SphereBufferGeometry(1, 20, 20)
	.scale(chest_r1, chest_h/2, chest_r2);
  object = new THREE.Mesh(
	geom, new THREE.MeshPhongMaterial({color: 0xffffff}));
  shape = makeConvexShape(geom);
  pos.set(0, y_offset + (pelvis_h + chest_h)/2 + spine_h, 0);
  chest = createRigidBody(object, shape, chest_m, pos, quat);

  var head_r1 = 0.09, head_r2 = 0.11, head_h = 0.28,
	head_m = total_weight * 0.08;
  geom = new THREE.SphereBufferGeometry(1, 8, 8)
	.scale(head_r1, head_h/2, head_r2);
  var texture = THREE.ImageUtils.loadTexture('face.png');
  texture.offset.set(-0.25, 0);
  object = new THREE.Mesh(
	geom, new THREE.MeshPhongMaterial({
	  color: 0x888800, transparent: true, map: texture}));
  object.add(new THREE.Mesh(
	geom.clone().scale(0.99, 0.99, 0.99),
	new THREE.MeshPhongMaterial({color: 0x888800})));
  shape = makeConvexShape(geom);
  pos.set(0, y_offset + (pelvis_h + head_h)/2 + spine_h + chest_h, 0);
  vec.set(0, 0, 1);
  quat.setFromAxisAngle(vec, 0);
  head = createRigidBody(object, shape, head_m, pos, quat);

  var upper_leg_r = 0.08, upper_leg_h = 0.50, upper_leg_x = 0.08,
	upper_leg_m = total_weight * 0.07;
  geom = new THREE.CylinderBufferGeometry(
	upper_leg_r, upper_leg_r, upper_leg_h, 10, 1);
  object =
	new THREE.Mesh(geom, new THREE.MeshPhongMaterial({color: 0x888800}));
  shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(upper_leg_r, upper_leg_h/2, upper_leg_r));
  pos.set(-upper_leg_x, y_offset - (pelvis_h + upper_leg_h)/2, 0);
  left_upper_leg = createRigidBody(object, shape, upper_leg_m, pos, quat);

  geom = new THREE.CylinderBufferGeometry(
	upper_leg_r, upper_leg_r, upper_leg_h, 10, 1);
  object =
	new THREE.Mesh(geom, new THREE.MeshPhongMaterial({color: 0x888800}));
  shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(upper_leg_r, upper_leg_h/2, upper_leg_r));
  pos.set(upper_leg_x, y_offset - (pelvis_h + upper_leg_h)/2, 0);
  right_upper_leg = createRigidBody(object, shape, upper_leg_m, pos, quat);

  var lower_leg_r = 0.05, lower_leg_h = 0.60, lower_leg_x = 0.065,
	lower_leg_m = total_weight * 0.07;
  geom = new THREE.CylinderBufferGeometry(
	lower_leg_r, lower_leg_r, lower_leg_h, 10, 1);
  object =
	new THREE.Mesh(geom, new THREE.MeshPhongMaterial({color: 0x888800}));
  shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(lower_leg_r, lower_leg_h/2, lower_leg_r));
  pos.set(-lower_leg_x, y_offset - upper_leg_h - (pelvis_h + lower_leg_h)/2, 0);
  left_lower_leg = createRigidBody(object, shape, lower_leg_m, pos, quat);

  geom = new THREE.CylinderBufferGeometry(
	lower_leg_r, lower_leg_r, lower_leg_h, 10, 1);
  object =
	new THREE.Mesh(geom, new THREE.MeshPhongMaterial({color: 0x888800}));
  shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(lower_leg_r, lower_leg_h/2, lower_leg_r));
  pos.set(lower_leg_x, y_offset - upper_leg_h - (pelvis_h + lower_leg_h)/2, 0);
  right_lower_leg = createRigidBody(object, shape, lower_leg_m, pos, quat);

  var upper_arm_r = 0.045, upper_arm_h = 0.30,
	upper_arm_m = total_weight * 0.05;
  geom = new THREE.CylinderBufferGeometry(
	upper_arm_r, upper_arm_r, upper_arm_h, 10, 1);
  object =
	new THREE.Mesh(geom, new THREE.MeshPhongMaterial({color: 0x888800}));
  shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(upper_arm_r, upper_arm_h/2, upper_arm_r));
  pos.set(-chest_r1 - upper_arm_r,
		  y_offset + pelvis_h/2 + spine_h + chest_h + upper_arm_h/2, 0);
  left_upper_arm = createRigidBody(object, shape, upper_arm_m, pos, quat);

  geom = new THREE.CylinderBufferGeometry(
	upper_arm_r, upper_arm_r, upper_arm_h, 10, 1);
  object =
	new THREE.Mesh(geom, new THREE.MeshPhongMaterial({color: 0x888800}));
  shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(upper_arm_r, upper_arm_h/2, upper_arm_r));
  pos.set(chest_r1 + upper_arm_r,
		  y_offset + pelvis_h/2 + spine_h + chest_h + upper_arm_h/2, 0);
  right_upper_arm = createRigidBody(object, shape, upper_arm_m, pos, quat);

  var lower_arm_r = 0.03, lower_arm_h = 0.40,
	lower_arm_m =  total_weight * 0.05;
  geom = new THREE.CylinderBufferGeometry(
	lower_arm_r, lower_arm_r, lower_arm_h, 10, 1);
  object =
	new THREE.Mesh(geom, new THREE.MeshPhongMaterial({color: 0x888800}));
  shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(lower_arm_r, lower_arm_h/2, lower_arm_r));
  pos.set(-chest_r1 - upper_arm_r,
		  y_offset + pelvis_h/2 + spine_h + chest_h + upper_arm_h
		  + lower_arm_h/2, 0);
  left_lower_arm = createRigidBody(object, shape, lower_arm_m, pos, quat);

  geom = new THREE.CylinderBufferGeometry(
	lower_arm_r, lower_arm_r, lower_arm_h, 10, 1);
  object =
	new THREE.Mesh(geom, new THREE.MeshPhongMaterial({color: 0x888800}));
  shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(lower_arm_r, lower_arm_h/2, lower_arm_r));
  pos.set(chest_r1 + upper_arm_r,
		  y_offset + pelvis_h/2 + spine_h + chest_h + upper_arm_h
		  + lower_arm_h/2, 0);
  right_lower_arm = createRigidBody(object, shape, lower_arm_m, pos, quat);

  /* ConeTwistConstraint.setLimit(3,θx), setLimit(4,θy), setLimit(5,θz)

	 constr.local な座標系の 原点からx軸方向、-x軸方向に向いた Cone
	 (Coneの広がりは、y軸回りに±θy, z軸回りに±θz)、
	 の内側にスイング動作を制限する。
	 ツイストの自由度は、x軸回りに±θx (確認してないので、もしかすると
	 [0..+θx]かも知れないが、きっと違う)

	 setLimit(3,θx)を省くと、どうも上手く機能しない。
   */
  transform1.setIdentity();
  transform1.getBasis().setEulerZYX(0, 0, Math.PI/2);
  transform1.setOrigin(new Ammo.btVector3(0, pelvis_h/2, 0));
  transform2.setIdentity();
  transform2.getBasis().setEulerZYX(0, 0, Math.PI/2);
  transform2.setOrigin(new Ammo.btVector3(0, -spine_h/2, 0));
  joint_pelvis_spine = new Ammo.btConeTwistConstraint(
	pelvis, spine, transform1, transform2);
  // 3: twist y-axis, 4: swing x-axis, 5: swint z-axis: global
  joint_pelvis_spine.setLimit(3, Math.PI/4);
  joint_pelvis_spine.setLimit(4, Math.PI/4);
  joint_pelvis_spine.setLimit(5, Math.PI/4);
  physicsWorld.addConstraint(joint_pelvis_spine, true);

  transform1.setIdentity();
  transform1.getBasis().setEulerZYX(0, 0, Math.PI/2);
  transform1.setOrigin(new Ammo.btVector3(0, spine_h/2, 0));
  transform2.setIdentity();
  transform2.getBasis().setEulerZYX(0, 0, Math.PI/2);
  transform2.setOrigin(new Ammo.btVector3(0, -chest_h/2, 0));
  joint_spine_chest = new Ammo.btConeTwistConstraint(
	spine, chest, transform1, transform2);
  // 3: twist x-axis, 4: swing y-axis, 5: swing z-axis: constraint local
  // 3: twist y-axis, 4: swing (-x)-axis, 5: swint z-axis: global
  joint_spine_chest.setLimit(3, Math.PI/4);
  joint_spine_chest.setLimit(4, Math.PI/4);
  joint_spine_chest.setLimit(5, Math.PI/4);
  physicsWorld.addConstraint(joint_spine_chest, true);

  transform1.setIdentity();
  transform1.getBasis().setEulerZYX(0, 0, Math.PI/2);
  transform1.setOrigin(new Ammo.btVector3(0, chest_h/2, 0));
  transform2.setIdentity();
  transform2.getBasis().setEulerZYX(0, 0, Math.PI/2);
  transform2.setOrigin(new Ammo.btVector3(0, -head_h/2, 0));
  joint_chest_head = new Ammo.btConeTwistConstraint(
	chest, head, transform1, transform2);
  // 3: twist x-axis, 4: swing y-axis, 5: swing z-axis: constraint local
  // 3: twist y-axis, 4: swing (-x)-axis, 5: swint z-axis: global
  joint_chest_head.setLimit(3, Math.PI/2);
  joint_chest_head.setLimit(4, Math.PI/3);
  joint_chest_head.setLimit(5, Math.PI/3);
  physicsWorld.addConstraint(joint_chest_head, true);

  // HingeConstraintを繋ぐ順番によって左右不均等になってしまう。どうやって修正していいか
  // 分からないが、誰でも利き腕はあるので、当面気にしない。
  axisA = new Ammo.btVector3(1, 0, 0);
  axisB = new Ammo.btVector3(1, 0, 0);
  pivotA = new Ammo.btVector3(-upper_leg_x, -pelvis_h/2, 0);
  pivotB = new Ammo.btVector3(0, upper_leg_h/2, 0);
  joint_left_hip = new Ammo.btHingeConstraint(
	pelvis, left_upper_leg, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(joint_left_hip, true);

  pivotA = new Ammo.btVector3(upper_leg_x - lower_leg_x, -upper_leg_h/2, 0);
  pivotB = new Ammo.btVector3(0, lower_leg_h/2, 0);
  joint_left_knee = new Ammo.btHingeConstraint(
	left_upper_leg, left_lower_leg, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(joint_left_knee, true);
  joint_left_knee.setLimit(-Math.PI/180*170, Math.PI/180*4, 0.9, 0.3, 1);

  pivotA = new Ammo.btVector3(-chest_r1, chest_h/2, 0);
  pivotB = new Ammo.btVector3(upper_arm_r, -upper_arm_h/2, 0);
  joint_left_shoulder = new Ammo.btHingeConstraint(
	chest, left_upper_arm, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(joint_left_shoulder, true);

  pivotA = new Ammo.btVector3(0, upper_arm_h/2, 0);
  pivotB = new Ammo.btVector3(0, -lower_arm_h/2, 0);
  joint_left_elbow = new Ammo.btHingeConstraint(
	left_upper_arm, left_lower_arm, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(joint_left_elbow, true);
  joint_left_elbow.setLimit(-Math.PI/180*170, Math.PI/180*2, 0.9, 0.3, 1);

  pivotA = new Ammo.btVector3(upper_leg_x, -pelvis_h/2, 0);
  pivotB = new Ammo.btVector3(0, upper_leg_h/2, 0);
  joint_right_hip = new Ammo.btHingeConstraint(
	pelvis, right_upper_leg, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(joint_right_hip, true);

  pivotA = new Ammo.btVector3(-upper_leg_x + lower_leg_x, -upper_leg_h/2, 0);
  pivotB = new Ammo.btVector3(0, lower_leg_h/2, 0);
  joint_right_knee = new Ammo.btHingeConstraint(
	right_upper_leg, right_lower_leg, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(joint_right_knee, true);
  joint_right_knee.setLimit(-Math.PI/180*170, Math.PI/180*4, 0.9, 0.3, 1);

  pivotA = new Ammo.btVector3(chest_r1, chest_h/2, 0);
  pivotB = new Ammo.btVector3(-upper_arm_r, -upper_arm_h/2, 0);
  joint_right_shoulder = new Ammo.btHingeConstraint(
	chest, right_upper_arm, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(joint_right_shoulder, true);

  pivotA = new Ammo.btVector3(0, upper_arm_h/2, 0);
  pivotB = new Ammo.btVector3(0, -lower_arm_h/2, 0);
  joint_right_elbow = new Ammo.btHingeConstraint(
	right_upper_arm, right_lower_arm, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(joint_right_elbow, true);
  joint_right_elbow.setLimit(-Math.PI/180*170, Math.PI/180*2, 0.9, 0.3, 1);

  pivotA = new Ammo.btVector3(0, chest_r1 + upper_arm_r, 0);
  pivotB = new Ammo.btVector3(0, lower_arm_h/2 + bar_r, 0);
  axisA = new Ammo.btVector3(0, -1, 0); // bar local
  joint_left_grip = new Ammo.btHingeConstraint(
	bar, left_lower_arm, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(joint_left_grip, true);

  pivotA = new Ammo.btVector3(0, -chest_r1 - upper_arm_r, 0);
  pivotB = new Ammo.btVector3(0, lower_arm_h/2 + bar_r, 0);
  axisA = new Ammo.btVector3(0, -1, 0); // bar local
  joint_right_grip = new Ammo.btHingeConstraint(
	bar, right_lower_arm, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(joint_right_grip, true);
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
	body.setLinearVelocity(new Ammo.btVector3(vel.x, vel.y, vel.z));
  }

  if ( angVel ) {
	body.setAngularVelocity(new Ammo.btVector3(angVel.x, angVel.y, angVel.z));
  }

  object.userData.physicsBody = body;
  object.userData.collided = false;

  scene.add(object);

  if (mass > 0) {
	rigidBodies.push(object);

	// Disable deactivation
	body.setActivationState(4);
  }

  physicsWorld.addRigidBody(body);

  return body;
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
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
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
  joint_left_hip.setMotorTarget(0, 0.1);
  joint_left_knee.setMotorTarget(0, 0.1);
  joint_left_shoulder.setMotorTarget(0, 0.1);
  joint_left_elbow.setMotorTarget(0, 0.1);
  joint_right_hip.setMotorTarget(0, 0.1);
  joint_right_knee.setMotorTarget(0, 0.1);
  joint_right_shoulder.setMotorTarget(0, 0.1);
  joint_right_elbow.setMotorTarget(0, 0.1);

  physicsWorld.stepSimulation(deltaTime, 10);

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

function startSwing() {
  joint_left_hip.enableAngularMotor(true, 0, 2);
  joint_left_knee.enableAngularMotor(true, 0, 2);
  joint_left_shoulder.enableAngularMotor(true, 0, 2);
  joint_left_elbow.enableAngularMotor(true, 0, 2);
  joint_right_hip.enableAngularMotor(true, 0, 2);
  joint_right_knee.enableAngularMotor(true, 0, 2);
  joint_right_shoulder.enableAngularMotor(true, 0, 2);
  joint_right_elbow.enableAngularMotor(true, 0, 2);

  var q = new Ammo.btQuaternion();
  q.setEulerZYX(0, 0, 0);

  joint_chest_head.setMotorTarget(q);
  joint_chest_head.setMaxMotorImpulse(2);
  joint_chest_head.enableMotor(true);
  joint_spine_chest.setMotorTarget(q);
  joint_spine_chest.setMaxMotorImpulse(2);
  joint_spine_chest.enableMotor(true);
  joint_pelvis_spine.setMotorTarget(q);
  joint_pelvis_spine.setMaxMotorImpulse(2);
  joint_pelvis_spine.enableMotor(true);

  var target_angle = Math.PI/180  * (-170); // 最初に体をこの角度まで持ち上げる
  var ms = pelvis.getMotionState();
  ms.getWorldTransform(transformAux1);
  var p = transformAux1.getOrigin();
  var pivotA = new Ammo.btVector3(0, 0, 0);
  var pivotB = new Ammo.btVector3(p.x(), -p.y(), p.z());
  var axisA = new Ammo.btVector3(0, -1, 0); // bar local
  var axisB = new Ammo.btVector3(1, 0, 0);
  helper_motor = new Ammo.btHingeConstraint(
	bar, pelvis, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(helper_motor, true);
  helper_motor.setMaxMotorImpulse(200);
  helper_motor.enableMotor(true);
  for ( var i = 0; i < 20; ++i ) {
	helper_motor.setMotorTarget(target_angle, 1);
	physicsWorld.stepSimulation(0.2, 100, 1./120);
  }

  physicsWorld.removeConstraint(helper_motor);
}

$(function() {
  Ammo().then(function(AmmoLib) {
	Ammo = AmmoLib;
	init();
	startSwing();
	animate();
  });
});
