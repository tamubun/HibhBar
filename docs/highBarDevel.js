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
var margin = 0.05;
var rigidBodies = [];

function init() {
  initGraphics();
  initPhysics();
  createObjects();
}

function initGraphics() {
  var container = document.getElementById('container');
  camera = new THREE.PerspectiveCamera(
	60, window.innerWidth / window.innerHeight, 0.2, 2000);
  camera.position.set(3, -0.7, 8);
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

var motors = [];

function createObjects() {
  var arm_radius = 0.04;
  var arm_length = 1.8;
  var arm_mass = 10;
  var object, shape, joint, transform;

  object = new THREE.Mesh(
	new THREE.CylinderBufferGeometry(
	  arm_radius, arm_radius, arm_length, 10, 1),
	new THREE.MeshPhongMaterial({color: 0xffffff})
  );
  shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(arm_radius, arm_length/2, arm_radius));
  pos.set(0, 0, 0);

  // ここで6Dofの問題がはっきりする。
  // ang_vel.z = 0 にしないとカオスになる。
  var ang_vel = new THREE.Vector3(0,0,3);
  var arm1 = createRigidBody(object, shape, arm_mass, pos, quat, null, ang_vel);
  var transform1 = new Ammo.btTransform();
  transform1.setIdentity();
  create6Dof(
    arm1, [0, arm_length * 0.5, 0], null,
    null, [0,0,0], null,
    [[0,0,0], [0,0,0], [+1,+1,+1], [-1,-1,-1]]);

  object = new THREE.Mesh(
	new THREE.CylinderBufferGeometry(
	  arm_radius, arm_radius, arm_length, 10, 1),
	new THREE.MeshPhongMaterial({color: 0xffffff})
  );
  object.add(new THREE.AxesHelper(2));
  shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(arm_radius, arm_length/2, arm_radius));

  pos.set(0, -arm_length, 0);
  ang_vel = new THREE.Vector3(0, 0, 0);
  var arm2 = createRigidBody(object, shape, arm_mass, pos, quat, null, ang_vel);
  joint = create6Dof(
    arm1, [0, -arm_length * 0.5, 0], null,
    arm2, [0,  arm_length * 0.5, 0], null,
    [[0,0,0], [0,0,0], [+1,+1,+1], [-1,-1,-1]]);

  for ( var i = 0; i < 3; ++i ) {
    var motor = joint.getRotationalLimitMotor(i);
    motor.m_maxLimitForce = 200;
    motor.m_maxMotorForce = 200;
    motor.m_enableMotor = true;
    motors.push(motor);
  }
  motors[0].m_targetVelocity = 1;
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

function create6Dof(
  objA, posA, eulerA = null, objB, posB, eulerB = null, limit, mirror = null)
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
  var joint;
  if ( objB !== null )
    joint = new Ammo.btGeneric6DofConstraint(
      objA, objB, transform1, transform2, true);
  else
    joint = new Ammo.btGeneric6DofConstraint(objA, transform1, true);
  joint.setLinearLowerLimit(new Ammo.btVector3(...limit[0]));
  joint.setLinearUpperLimit(new Ammo.btVector3(...limit[1]));
  if ( mirror != null ) {
    var tmp = [...limit[3]];
    limit[3][1] = -limit[2][1];
    limit[3][2] = -limit[2][2];
    limit[2][1] = -tmp[1];
    limit[2][2] = -tmp[2];
  }
  joint.setAngularLowerLimit(new Ammo.btVector3(...limit[2]));
  joint.setAngularUpperLimit(new Ammo.btVector3(...limit[3]));

  physicsWorld.addConstraint(joint, true);
  return joint;
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

Ammo().then(function(AmmoLib) {
  Ammo = AmmoLib;
  init();
  animate();
});
