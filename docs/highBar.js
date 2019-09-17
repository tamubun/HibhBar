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
var hinge, hinge2;

var armMovement = false;

function init() {
  initInput();
  initGraphics();
  initPhysics();
  createObjects();
}

function initInput() {
  armMovement = false;
  window.addEventListener('keyup', function (event) {
	switch ( event.keyCode ) {
	case 65: // A
	  armMovement = true;
	  break;
	case 66: // B
	  armMovement = false;
	  break;
	}
  }, false);
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

function createObjects() {
  var bar_radius = 0.024;
  var bar_length = 2.4;
  var bar_mass = 0;
  var object = new THREE.Mesh(
	new THREE.CylinderBufferGeometry(
	  bar_radius, bar_radius, bar_length, 10, 1),
	new THREE.MeshPhongMaterial({color: 0xffffff})
  );
  var shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(bar_radius, bar_length/2, bar_radius));
  shape.setMargin(margin);
  pos.set(0, 0, 0);
  vec.set(0, 0, 1);
  quat.setFromAxisAngle(vec, Math.PI/2);
  var bar = createRigidBody(object, shape, bar_mass, pos, quat);

  var arm_radius = 0.04;
  var arm_length = 1.0;
  var arm_mass = 10;
  object = new THREE.Mesh(
	new THREE.CylinderBufferGeometry(
	  arm_radius, arm_radius, arm_length, 10, 1),
	new THREE.MeshPhongMaterial({color: 0xffffff})
  );
  shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(arm_radius, arm_length/2, arm_radius));
  shape.setMargin(margin);
  pos.set(0, -(arm_length / 2 + bar_radius * 1.01), 0);
  vec.set(0, 0, 1);
  quat.setFromAxisAngle(vec, 0);
  var ang_vel = new THREE.Vector3(20, 0, 0);
  var arm = createRigidBody(object, shape, arm_mass, pos, quat, null, ang_vel);

  // Hinge constraint to move the arm
  var pivotA = new Ammo.btVector3(0, 0, 0);
  var pivotB = new Ammo.btVector3(0, arm_length / 2 + bar_radius * 1.01, 0);
  var axisA = new Ammo.btVector3(0, 1, 0); // bar local
  var axisB = new Ammo.btVector3(1, 0, 0);
  hinge = new Ammo.btHingeConstraint(
	bar, arm, pivotA, pivotB, axisA, axisB, true);
  physicsWorld.addConstraint(hinge, true);

  var arm2_radius = 0.06;
  var arm2_length = 0.8;
  var arm2_mass = 10;
  object = new THREE.Mesh(
	new THREE.CylinderBufferGeometry(
	  arm2_radius, arm2_radius, arm2_length, 10, 1),
	new THREE.MeshPhongMaterial({color: 0xffffff})
  );
  shape = new Ammo.btCylinderShape(
	new Ammo.btVector3(arm2_radius, arm2_length/2, arm2_radius));
  shape.setMargin(margin);
  pos.set(0, -(arm2_length / 2 + arm_length + bar_radius * 1.01), 0);
  vec.set(0, 0, 1);
  quat.setFromAxisAngle(vec, 0);
  var ang_vel = new THREE.Vector3(10, 0, 0);
  var arm2 =
	createRigidBody(object, shape, arm2_mass, pos, quat, null, null);

  var pivotA2 = new Ammo.btVector3(0, -arm_length / 2, 0);
  var pivotB2 = new Ammo.btVector3(0, arm2_length / 2, 0);
  var axisA2 = new Ammo.btVector3(1, 0, 0);
  var axisB2 = new Ammo.btVector3(1, 0, 0);
  hinge2 = new Ammo.btHingeConstraint(
	arm, arm2, pivotA2, pivotB2, axisA2, axisB2, true);
  physicsWorld.addConstraint(hinge2, true);
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

  if ( armMovement ) {
	hinge2.enableAngularMotor( true, 1.5, 50 );
  } else {
	hinge2.enableAngularMotor( false, 0, 50 );
  }

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

$(function() {
  Ammo().then(function(AmmoLib) {
	Ammo = AmmoLib;
	init();
	animate();
  });
});
