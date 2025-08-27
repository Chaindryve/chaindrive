import Array "mo:base/Array";
import Buffer "mo:base/Buffer";
import HashMap "mo:base/HashMap";
import Nat "mo:base/Nat";
import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Time "mo:base/Time";

type RideId = Nat;
type UserId = Principal;

type Location = {
    latitude : Float;
    longitude : Float;
};

type RideStatus = {
    #pending;
    #accepted;
    #completed;
    #cancelled;
};

type Ride = {
    id : RideId;
    passengerId : UserId;
    driverId : ?UserId;
    pickupLocation : Location;
    dropoffLocation : Location;
    status : RideStatus;
    price : Float;
    createdAt : Int;
    updatedAt : Int;
};

actor class RideBackend() = this {
    private stable var nextRideId : Nat = 1;
    private let rides = HashMap.HashMap<RideId, Ride>(0, Nat.equal, Hash.hash);

    // Create a new ride
    public shared (msg) func createRide(
        pickupLocation : Location,
        dropoffLocation : Location,
        price : Float,
    ) : async Result.Result<Ride, Text> {
        let rideId = nextRideId;
        nextRideId += 1;

        let now = Time.now();
        let ride : Ride = {
            id = rideId;
            passengerId = msg.caller;
            driverId = null;
            pickupLocation;
            dropoffLocation;
            status = #pending;
            price;
            createdAt = now;
            updatedAt = now;
        };

        rides.put(rideId, ride);
        #ok(ride);
    };

    // Get ride by ID
    public query func getRide(rideId : RideId) : async ?Ride {
        rides.get(rideId);
    };

    // Get all rides for a passenger
    public query func getPassengerRides(passengerId : UserId) : async [Ride] {
        let userRides = Buffer.Buffer<Ride>(0);
        for (ride in rides.vals()) {
            if (ride.passengerId == passengerId) {
                userRides.add(ride);
            };
        };
        userRides.toArray();
    };

    // Accept a ride (for drivers)
    public shared (msg) func acceptRide(rideId : RideId) : async Result.Result<Ride, Text> {
        switch (rides.get(rideId)) {
            case (?ride) {
                if (ride.status != #pending) {
                    return #err("Ride is not available for acceptance");
                };
                
                let updatedRide = {
                    ride with
                    driverId = ?msg.caller;
                    status = #accepted;
                    updatedAt = Time.now();
                };
                
                rides.put(rideId, updatedRide);
                #ok(updatedRide);
            };
            case null {
                #err("Ride not found");
            };
        };
    };

    // Complete a ride
    public shared (msg) func completeRide(rideId : RideId) : async Result.Result<Ride, Text> {
        switch (rides.get(rideId)) {
            case (?ride) {
                if (ride.driverId != ?msg.caller) {
                    return #err("Only the assigned driver can complete the ride");
                };
                
                let updatedRide = {
                    ride with
                    status = #completed;
                    updatedAt = Time.now();
                };
                
                rides.put(rideId, updatedRide);
                #ok(updatedRide);
            };
            case null {
                #err("Ride not found");
            };
        };
    };

    // Get all available rides (for drivers)
    public query func getAvailableRides() : async [Ride] {
        let availableRides = Buffer.Buffer<Ride>(0);
        for (ride in rides.vals()) {
            if (ride.status == #pending) {
                availableRides.add(ride);
            };
        };
        availableRides.toArray();
    };

    // Get driver's rides
    public query func getDriverRides(driverId : UserId) : async [Ride] {
        let driverRides = Buffer.Buffer<Ride>(0);
        for (ride in rides.vals()) {
            switch (ride.driverId) {
                case (?id) if (id == driverId) {
                    driverRides.add(ride);
                };
                case _ {};
            };
        };
        driverRides.toArray();
    };
};
