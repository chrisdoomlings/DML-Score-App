$(document).ready(function () {
	var people = [];
	var resultsTimeout;

	class Person {
		constructor(name) {
			this.id = idGen.getId();
			this.name = name;
			this.worldPoints = 0;
			this.facePoints = 0;
			this.bonusPoints = 0;
			this.meaningPoints = 0;
			this.totalPoints = 0;
		}

		total() {
			this.worldPoints = this.worldPoints || 0;
			this.facePoints = this.facePoints || 0;
			this.bonusPoints = this.bonusPoints || 0;
			this.meaningPoints = this.meaningPoints || 0;

			var sum = parseInt(this.worldPoints) + parseInt(this.facePoints) + parseInt(this.bonusPoints) + parseInt(this.meaningPoints);
			return sum;
		}
	}

	// Setup slide variables and init
	var slides = $(".container");
	var currentIndex = 0;

	slides.hide();
	slides.eq(currentIndex).show();

	function calculateWinner() {
		people.sort((a, b) => {
			return b.total() - a.total();
		});
		console.log(people);
	}
	//dd
	function delay(time) {
		return new Promise((resolve) => setTimeout(resolve, time));
	}

	// Render each part of the application
	function renderSlide(slide) {
		console.log("Slide: " + slide);

		if (slide == 2) {
			renderWorldList();
		} else if (slide == 3) {
			renderFaceList();
		} else if (slide == 4) {
			renderBonusList();
		} else if (slide == 5) {
			renderMeaningList();
		} else if (slide == 6) {
			$("#monster-container img").show();
			$("#leaderboard").hide();

			delay(0).then(() => {
				calculateWinner();

				// } else if (slide == 7) {

				if (people[0].total() == people[1].total()) {
					$(".winner-name").html(people[0].name + "<br />" + people[1].name);
					$(".winner-name-long").html(people[0].name + " and " + people[1].name);
					$(".winner-context").html("each with");

					var leaderboard = "";

					for (var i = 2; i < people.length; i++) {
						leaderboard += people[i].name + " (" + people[i].total() + ") <br />";
					}
					$("#winner-points").html(people[0].total());
					$("#leaderboard").html(leaderboard);
				} else {
					$(".winner-name").html(people[0].name);
					$(".winner-name-long").html(people[0].name);
					$(".winner-context").html("with");

					var leaderboard = "";

					for (var i = 1; i < people.length; i++) {
						leaderboard += people[i].name + " (" + people[i].total() + ") <br />";
					}
					$("#winner-points").html(people[0].total());
					$("#leaderboard").html(leaderboard);
				}
			});
		}

		slides.hide();
		slides.eq(slide).show();
	}

	$(".btn-next-list").on("click", function () {
		if (Object.keys(people).length < 2) {
			alert("You must enter at least 2 player names.");
		} else {
			currentIndex++;

			if (currentIndex == slides.length) {
				currentIndex--;
			} else {
				renderSlide(currentIndex);
			}

			$("html,body").animate({ scrollTop: 0 }, "slow");
		}
	});

	$(".btn-next").on("click", function () {
		currentIndex++;

		if (currentIndex == slides.length) {
			currentIndex--;
		} else {
			renderSlide(currentIndex);
		}

		$("html,body").animate({ scrollTop: 0 }, "slow");
	});

	$(".btn-back").on("click", function () {
		currentIndex--;

		if (currentIndex < 0) {
			currentIndex = 0;
		} else {
			renderSlide(currentIndex);
		}

		$("html,body").animate({ scrollTop: 0 }, "slow");
	});

	$(".btn-next-2").on("click", function () {
		currentIndex += 2;

		if (currentIndex == slides.length) {
			currentIndex--;
		} else {
			renderSlide(currentIndex);
		}

		$("html,body").animate({ scrollTop: 0 }, "slow");
	});

	$(".btn-back-2").on("click", function () {
		clearTimeout(resultsTimeout);
		currentIndex -= 2;

		if (currentIndex == slides.length) {
			currentIndex--;
		} else {
			renderSlide(currentIndex);
		}

		$("html,body").animate({ scrollTop: 0 }, "slow");
	});

	$(".reset").on("click", function () {
		location.reload();
	});

	$(".addBtn").on("click", function () {
		addPerson();
	});

	$(".rematch-btn").on("click", function () {
		currentIndex = 1;
		renderSlide(currentIndex);

		for (var i = 0; i < people.length; i++) {
			people[i].worldPoints = 0;
			people[i].facePoints = 0;
			people[i].bonusPoints = 0;
			people[i].meaningPoints = 0;
		}

		$("html,body").animate({ scrollTop: 0 }, "slow");
	});

	function Generator() {}
	Generator.prototype.rand = Math.floor(Math.random() * 26) + Date.now();
	Generator.prototype.getId = function () {
		return this.rand++;
	};
	var idGen = new Generator();

	function addPerson() {
		if (document.getElementById("myInput").value === "") {
			alert("You must write something!");
		} else {
			if (people.length < 8) {
				var nameInput = document.getElementById("myInput").value;
				var p = new Person(nameInput);
				people.push(p);
				console.log(people);
				document.getElementById("myInput").value = "";

				renderInputList();
			} else {
				alert("Sorry, only 8 players allowed at a time.");
			}
		}
	}

	function removePerson(inputId) {
		console.log(inputId);

		var index = people.findIndex(function (o) {
			return o.id == inputId;
		});

		if (index !== -1) people.splice(index, 1);

		console.log(people);
		renderInputList();
	}

	function renderInputList() {
		document.getElementById("myUL").innerHTML = "";

		people.forEach((element, index, array) => {
			newElement(element);
		});
	}

	function renderWorldList() {
		document.getElementById("world-list").innerHTML = "";

		people.forEach((element, index, array) => {
			if (element.worldPoints != 0) {
				$("#world-list").append("<li><span class='list-name'>" + element.name + "</span><span class='point-input'><input id='" + element.id + "' type='number' class='point-input world-input' placeholder='0' value='" + element.worldPoints + "' data-index='" + index + "'></span></li>");
			} else {
				$("#world-list").append("<li><span class='list-name'>" + element.name + "</span><span class='point-input'><input id='" + element.id + "' type='number' class='point-input world-input' placeholder='0' data-index='" + index + "'></span></li>");
			}

			$("#world-list #" + element.id).change(function () {
				//Find index of specific object using findIndex method.
				objIndex = people.findIndex((obj) => obj.id == element.id);

				//Log object to Console.
				console.log("Before update: ", people[objIndex]);

				//Update object's name property.
				people[objIndex].worldPoints = $(this).val();

				//Log object to console again.
				console.log("After update: ", people[objIndex]);
			});

			$(".world-input").on("keydown", function (event) {
				if (event.which == 13) {
					event.preventDefault();
					var $this = $(event.target);
					var index = parseFloat($this.attr("data-index"));
					$('[data-index="' + (index + 1).toString() + '"]').focus();
				}
			});
		});
	}

	function renderFaceList() {
		document.getElementById("face-list").innerHTML = "";

		people.forEach((element, index, array) => {
			if (element.facePoints != 0) {
				$("#face-list").append("<li><span class='list-name'>" + element.name + "</span><span class='point-input'><input id='" + element.id + "' type='number' class='point-input' placeholder='0' value='" + element.facePoints + "' data-index='" + index + "'></span></li>");
			} else {
				$("#face-list").append("<li><span class='list-name'>" + element.name + "</span><span class='point-input'><input id='" + element.id + "' type='number' class='point-input' placeholder='0' data-index='" + index + "'></span></li>");
			}

			$("#face-list #" + element.id).change(function () {
				//Find index of specific object using findIndex method.
				objIndex = people.findIndex((obj) => obj.id == element.id);

				//Log object to Console.
				console.log("Before update: ", people[objIndex]);

				//Update object's name property.
				people[objIndex].facePoints = $(this).val();

				//Log object to console again.
				console.log("After update: ", people[objIndex]);
			});

			$("input.point-input").on("keydown", function (event) {
				if (event.which == 13) {
					event.preventDefault();
					var $this = $(event.target);
					var index = parseFloat($this.attr("data-index"));
					$('[data-index="' + (index + 1).toString() + '"]').focus();
				}
			});
		});
	}

	function renderBonusList() {
		document.getElementById("bonus-list").innerHTML = "";

		people.forEach((element, index, array) => {
			if (element.bonusPoints != 0) {
				$("#bonus-list").append("<li><span class='list-name'>" + element.name + "</span><span class='point-input'><input id='" + element.id + "' type='number' class='point-input' placeholder='0' value='" + element.bonusPoints + "' data-index='" + index + "'></span></li>");
			} else {
				$("#bonus-list").append("<li><span class='list-name'>" + element.name + "</span><span class='point-input'><input id='" + element.id + "' type='number' class='point-input' placeholder='0' data-index='" + index + "'></span></li>");
			}

			$("#bonus-list #" + element.id).change(function () {
				//Find index of specific object using findIndex method.
				objIndex = people.findIndex((obj) => obj.id == element.id);

				//Log object to Console.
				console.log("Before update: ", people[objIndex]);

				//Update object's name property.
				people[objIndex].bonusPoints = $(this).val();

				//Log object to console again.
				console.log("After update: ", people[objIndex]);
			});

			$("input.point-input").on("keydown", function (event) {
				if (event.which == 13) {
					event.preventDefault();
					var $this = $(event.target);
					var index = parseFloat($this.attr("data-index"));
					$('[data-index="' + (index + 1).toString() + '"]').focus();
				}
			});
		});
	}

	function renderMeaningList() {
		document.getElementById("meaning-list").innerHTML = "";

		people.forEach((element, index, array) => {
			if (element.meaningPoints != 0) {
				$("#meaning-list").append("<li><span class='list-name'>" + element.name + "</span><span class='point-input'><input id='" + element.id + "' type='number' class='point-input' placeholder='0' value='" + element.meaningPoints + "' data-index='" + index + "'></span></li>");
			} else {
				$("#meaning-list").append("<li><span class='list-name'>" + element.name + "</span><span class='point-input'><input id='" + element.id + "' type='number' class='point-input' placeholder='0' data-index='" + index + "'></span></li>");
			}

			$("#meaning-list #" + element.id).change(function () {
				//Find index of specific object using findIndex method.
				objIndex = people.findIndex((obj) => obj.id == element.id);

				//Log object to Console.
				console.log("Before update: ", people[objIndex]);

				//Update object's name property.
				people[objIndex].meaningPoints = $(this).val();

				//Log object to console again.
				console.log("After update: ", people[objIndex]);
			});

			$("input.point-input").on("keydown", "input", function (event) {
				if (event.which == 13) {
					event.preventDefault();
					var $this = $(event.target);
					var index = parseFloat($this.attr("data-index"));
					$('[data-index="' + (index + 1).toString() + '"]').focus();
				}
			});
		});
	}

	function newElement(element) {
		var li = document.createElement("li");
		var inputValue = element.name;
		var t = document.createTextNode(inputValue);
		li.appendChild(t);

		document.getElementById("myUL").appendChild(li);

		document.getElementById("myInput").value = "";

		var span = document.createElement("SPAN");
		var txt = document.createTextNode("\u00D7");
		span.className = "close";
		span.id = element.id;
		span.onclick = function () {
			removePerson(span.id);
		};
		span.appendChild(txt);
		li.appendChild(span);
	}

	const element = document.querySelector("#monster-container img");

	element.addEventListener("animationend", () => {
		console.log("Animation Done");
		$("#monster-container img").slideUp(300);
		$("#leaderboard").fadeIn(300);
	});

	const element2 = document.querySelector(".penguin");

	element2.addEventListener("animationend", () => {
		console.log("Animation Done");
		resultsTimeout = setTimeout(() => {
			currentIndex++;

			if (currentIndex == slides.length) {
				currentIndex--;
			} else {
				renderSlide(currentIndex);
			}

			$("html,body").animate({ scrollTop: 0 }, "slow");
		}, 3000);
	});
});
