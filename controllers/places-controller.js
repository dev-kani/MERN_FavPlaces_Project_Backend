const fs = require('fs')
const mongoose = require('mongoose')
const uuid = require('uuid/v4')
const { validationResult } = require('express-validator')
const HttpError = require('../models/http-error')
const getCoordsForAddress = require('../util/location')
const Place = require('../models/place')
const User = require('../models/user')

const getPlaceById = async (req, res, next) => {
  const placeId = req.params.pid

  let place
  try {
    place = await Place.findById(placeId)
  } catch (err) {
    console.log(err)
    const error = new HttpError(`There is no place with id: ${placeId}`)
    return next(error)
  }

  if (!place) {
    const error = new HttpError(`Could not find a place for a the provided id: ${placeId}`, 404)
    return next(error)
  }

  res.json({ place: place.toObject({ getters: true }) })
}

const getPlacesByUserId = async (req, res, next) => {
  const userId = req.params.uid

  let userWithPlaces
  try {
    userWithPlaces = await User.findById(userId).populate('places')
  } catch (err) {
    console.log(err)
    const error = new HttpError(`Could not find places for this user with id: ${userId}`, 404)
    return next(error)
  }

  if (!userWithPlaces || userWithPlaces.places.length === 0) {
    return next(new HttpError(`Could not find places for the provided user id: ${userId}`, 404))
  }

  res.json({ places: userWithPlaces.places.map(place => place.toObject({ getters: true })) })
}

const createPlace = async (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    console.log(errors)
    return next(new HttpError('Invalid inputs passed, please check data', 422))
  }
  const { title, description, coordinates, address } = req.body

  let newCoordinates
  try {
    newCoordinates = await getCoordsForAddress(address)
  } catch (error) {
    return next(error)
  }

  const createdPlace = new Place({
    title,
    description,
    image: req.file.path,
    address,
    location: newCoordinates,
    creator: req.userData.userId
  })

  let user
  try {
    user = await User.findById(req.userData.userId)
  } catch (err) {
    console.log(err)
    const error = new HttpError(
      `Could not find a user with id: ${req.userData.userId}`, 500
    )
    return next(error)
  }

  if (!user) {
    const error = new HttpError(`Could not find a user for id: ${creator}`, 404)
    return next(error)
  }

  console.log(user)

  try {
    const sess = await mongoose.startSession()
    sess.startTransaction()
    await createdPlace.save({ session: sess })
    user.places.push(createdPlace)
    await user.save({ session: sess })
    await sess.commitTransaction()
  } catch (err) {
    console.log(err)
    const error = new HttpError(
      'Creating a new place was unsuccessful, please try again!', 500
    )
    return next(error)
  }

  res.status(201).json({ place: createdPlace })
}

const updatePlace = async (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    console.log(errors)
    return next(new HttpError('Invalid inputs passed, please check data', 422))
  }
  const { title, description } = req.body
  const placeId = req.params.pid

  let place
  try {
    place = await Place.findById(placeId)
  } catch (err) {
    console.log(err)
    const error = new HttpError(`There is no place with id: ${placeId}`)
    return next(error)
  }

  if (place.creator.toString() !== req.userData.userId) {
    const error = new HttpError(`You are not allowed to edit this place`, 401)
    return next(error)
  }

  place.title = title
  place.description = description

  try {
    await place.save()
  } catch (err) {
    console.log(err)
    const error = new HttpError(
      'Creating a new place was unsuccessful, please try again!', 500
    )
    return next(error)
  }

  res.status(200).json({ place: place.toObject({ getters: true }) })
}

const deletePlace = async (req, res, next) => {
  const placeId = req.params.pid
  let place
  try {
    place = await Place.findById(placeId).populate('creator')
  } catch (err) {
    console.log(err)
    const error = new HttpError(`There is no place with id: ${placeId}`, 500)
    return next(error)
  }

  if (!place) {
    const error = new HttpError(`There is no place with id: ${placeId}`, 404)
    return next(error)
  }

  const imagePath = place.image

  try {
    const sess = await mongoose.startSession()
    sess.startTransaction()
    await place.remove({ session: sess })
    place.creator.places.pull(place)
    await place.creator.save({ session: sess })
    await sess.commitTransaction()
  } catch (err) {
    console.log(err)
    const error = new HttpError(
      'Deleting the place was unsuccessful, please try again!', 500
    )
    return next(error)
  }

  fs.unlink(imagePath, err => {
    console.log(err);
  })

  res.status(200).json({ message: `The Place Deleted with id: ${placeId}` })
}

module.exports = {
  getPlaceById,
  getPlacesByUserId,
  createPlace,
  updatePlace,
  deletePlace
} 