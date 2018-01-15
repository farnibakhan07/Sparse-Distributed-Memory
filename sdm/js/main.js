// Handle Socket Connections
// Start Worker Javascript

    
var previousChunk; // Chunk for keeping track of iteration
var chunkSize;
var number_Nodes = 1;
var searchResponseBuffer = [];
// Helper Functions
function generateChunk(chunkSize) {
    
        chunk = new Int8Array(chunkSize);
    
        for (var i = 0; i < chunk.length; i++) {
            chunk[i] = getRandomBinary();
        }
        return chunk;
    }


function getRandomBinary() {
    return Math.round(Math.random()); //The maximum is inclusive and the minimum is inclusive 
}

function convertStringToArray(inputString) {
    return new Int8Array(inputString.split(','));
}

// Function to sum array of chunks into one chunk for binarizing without threshold
function sumChunksPositionwise(chunks) {
    
        // Create a temporary chunk with the size of the first chunk
        bipolarChunk = new Int8Array(chunkSize);
    
        // Aggregate the resultant sum
        for (var chunk of chunks) {
            for (var i = 0; i < chunk.length; i++) {
                bipolarChunk[i] += chunk[i];
              }
        }
        
        return bipolarChunk;
}

function binarizeChunk(chunk) {
    
        binaryChunk = new Int8Array(chunk.length);
        for (var i = 0; i < chunk.length; i++) {
            if (chunk[i] < 0) {
                binaryChunk[i] = 0;
            } else {
                binaryChunk[i] = 1;
            }
          }
        return binaryChunk;
}

// Function to handle response from your search request
function handleSearchResponse(previousChunk, currentChunk) {
    
        // Check hamming distance between previous and current
        var distance = hammingDistance(previousChunk, currentChunk);
        
        // End Cases
        if (distance == 0) {
            // Emit response as best match found
            return "converged";
        } else if (distance == (chunkSize / 2)) {
            // Emit Error - Chunk not found
            return "diverged";
        } else {
           // Emit broadcast again and wait for responses or recursion for single node
          return distance;  
        }
    
}

// Function to calculate the hamming distance of two chucks
function hammingDistance(address, data) {
    var distance = 0;

    for (var i = 0; i < data.length; i++) {
        if (address[i] === data[i]) {
            continue
        } else {
            distance += 1;
        }
    }

    return distance;
}


// Notification wrapper
function notificationMessage(title, message) {
    iziToast.show({
        title: title,
        message: message
    });
}


$(document).ready(function(){

    const supernode = "http://" + window.location.hostname + ":3000";

    socket = io(supernode);
    let worker = new Worker('js/sdmworker.js');
    
    worker.addEventListener('message', function(e) {
        switch (e.data.cmd) {
        case "storage_response":
            // Success message for system stored
            notificationMessage("Storage", "Stored Chunk successfully");
            break;
            
        case "search_response":
            e.data.chunkToSearch = e.data.chunkToSearch.toString();
            socket.emit('searchResponse', e.data);
            break;            
    
        default:
            break;
    }
    }, false);
     
    socket.on('defaultConfiguration',function(data){
        $('#addressSize').val(data.addressSize);
        iziToast.show({
            title: 'Default Configurations',
            message: 'What would you like to add?'
        });
    });
    
    socket.on('total_nodes',function(data){
        // Keep track of number of nodes
        number_Nodes = data.length;
    });

    socket.on('storageRequest', function(data){
       var noToGenerate = data.noToGenerate;
       generatedChunk = convertStringToArray(data.generatedChunk);

       query = {
        cmd: "storage_request",
        noToGenerate: noToGenerate,
        generatedChunk: generatedChunk,
      };
        notificationMessage("Storage", "Storate Request made");
    
        worker.postMessage(query, [query.generatedChunk.buffer]);
       
    });
    
    socket.on('searchRequest',function(data){
        chunkToSearch = convertStringToArray(data.chunkToSearch);
 
        query = {
            cmd: "search_request",
            id: data.id,
            chunkToSearch: chunkToSearch
          };
        
        worker.postMessage(query, [query.chunkToSearch.buffer]);
        notificationMessage("Search", "Search Request");
    });

    socket.on('searchResponse', function(data) {
        console.log("Got a response from a peer");
        notificationMessage("Search", "Search Response");
       
        searchResponseBuffer.push(convertStringToArray(data.chunkToSearch));
        if (searchResponseBuffer.length == (number_Nodes - 1)) {

            currentChunk = binarizeChunk(sumChunksPositionwise(searchResponseBuffer));
            $('#bestMatch').val(currentChunk);
            response = handleSearchResponse(previousChunk, currentChunk);
            $('#hamming').val(response);
            searchResponseBuffer = [];
            previousChunk = currentChunk;

            if (response == "converged") {
                iziToast.success({
                    title: 'Search Converged',
                    message: 'Search successfully converged',
                });
                $('#bestMatch').val(currentChunk);   
                return;
            } else if (response == "diverged") {
                iziToast.error({
                    title: 'Search Diverged',
                    message: 'Search Diverged',
                });
                return;
            } else {
                query = {
                    cmd: "search_request",
                    id: socket.id,
                    chunkToSearch: currentChunk,
                };

                // Send back to other clients
                query.chunkToSearch = currentChunk.toString();

                socket.emit("searchChunk", query);
            }

        } 

    });

    socket.on('stats',function(data){
        
    });

    // worker.postMessage({
    //     cmd: "search"
    //   });

    // function to generate a chunk of particular size

    $('#configureButton').click(function() {
      var maxChunks = $('#maxChunks').val();
      var addressThreshold = $('#addressThreshold').val();
      var minStorageThreshold = $('#minStorageThreshold').val();
      var maxStorageThreshold = $('#maxStorageThreshold').val();
      chunkSize = $('#addressSize').val();

      var storageThreshold = [minStorageThreshold, maxStorageThreshold];

      // Send to worker
      worker.postMessage({
        cmd: "init",
        storageThreshold: storageThreshold,
        maxChunks: maxChunks,
        maxThreshold: addressThreshold,
        chunkSize: chunkSize
      });
    
      notificationMessage('Storage', 'Created memory successfully');
      
      return false;
    });

    $('#generateButton').click(function() {
        generatedChunk = generateChunk(chunkSize);
        $('#generatedChunk').val(generatedChunk); 
        return false;
      });

      $('#storeButton').click(function() {
        var noOfIterations = $('#noOfIterations').val();
        generatedChunk = convertStringToArray($('#generatedChunk').val());
        query = {
            cmd: "storage_request",
            noToGenerate: noOfIterations,
            generatedChunk: generatedChunk,
          };
        
        worker.postMessage(query, [generatedChunk.buffer]);

        query.generatedChunk = $('#generatedChunk').val();
        socket.emit('storeChunk', query);

        
        return false;
      });

      $('#searchButton').click(function() {
        var chunkToSearch = convertStringToArray($('#chunkToSearch').val());
        previousChunk = chunkToSearch;
        if (previousChunk.length != chunkSize) {
            return false;
        }

        query = {
            cmd: "search_request",
            id: socket.id,
            chunkToSearch: chunkToSearch,
        };

        // Set field to true for peers
        query.chunkToSearch = $('#chunkToSearch').val();
        socket.emit('searchChunk', query);

        console.log("Beginning search");
        return false;
      });

    
    function appendMessage(msg){
      $('#messages').append($('<li>').text(msg));
      var message = document.getElementById("message_block");
      message.scrollTop = message.scrollHeight;
    }
  });


